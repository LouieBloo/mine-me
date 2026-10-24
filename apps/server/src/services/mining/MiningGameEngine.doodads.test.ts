import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType, type DamageEvent, type DoodadDefinition, type DoodadPlacement, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';
import { MiningDoodadSubsystem } from './subsystems/MiningDoodadSubsystem';

const def = (key: string, anchor: DoodadDefinition['anchor']): DoodadDefinition => ({ id: key, key, name: key, anchor, width: 1, height: 1, zOffset: 0, biomes: [] });
// Ordered by key, so these are type 0..3
const DEFS = [def('a_floor', 'FLOOR'), def('b_ceiling', 'CEILING'), def('c_wall', 'WALL'), def('d_air', 'AIR')];
const FLOOR = 0, CEILING = 1, WALL = 2, AIR = 3;

const hit = (over: Partial<DamageEvent> = {}): DamageEvent => ({ amount: 99999, type: 'mining', source: { kind: 'environment' }, ...over }) as DamageEvent;

describe('doodads in a mining room (tickets 101, 105)', () => {
  const cid = 'doodad-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const lastTick = () => ticks()[ticks().length - 1];
  const set = (x: number, y: number, type: MiningTileType, revealed = false) => { engine.grid[y][x] = { type, revealed }; };
  const place = (placements: DoodadPlacement[]) => {
    engine.doodadSubsystem = new MiningDoodadSubsystem((engine as any).worldView, DEFS, placements);
  };
  const at = (typeIndex: number, x: number, y: number, flip = false): DoodadPlacement => ({ typeIndex, x, y, variant: 0, flip });
  const standing = () => engine.doodadSubsystem.placements().map((p) => `${p.typeIndex}@${p.x},${p.y}`);

  /**
   * A pocket x 30..36, y 30..31 of open air in solid dirt (y 29 roof, y 32 floor, x 29 and 37 walls), nothing revealed, the
   * player far away. Doodads: floor (31,31), ceiling (33,30), wall (30,30) on the left wall, air (35,30).
   */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = 28; y <= 33; y++) for (let x = 28; x <= 38; x++) set(x, y, x >= 30 && x <= 36 && y >= 30 && y <= 31 ? MiningTileType.EMPTY : MiningTileType.DIRT);
    engine.players.get(cid)!.playerBody.position = { x: 130.5, y: 5.5 };
    place([at(FLOOR, 31, 31), at(CEILING, 33, 30), at(WALL, 30, 30), at(AIR, 35, 30)]);
  });

  describe('what the client is told', () => {
    it('sends the kinds once with the map, and no placement while the fog hides them', () => {
      const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
      expect(state.doodads?.map((d) => d.key)).toEqual(['a_floor', 'b_ceiling', 'c_wall', 'd_air']);
      expect(state.doodadPlacements).toBeUndefined();
      tick(3);
      expect(ticks().every((t) => !t.doodadsAdded)).toBe(true);
    });

    it('sends a doodad when its ground is revealed, in the compact form, and only the ones revealed', () => {
      set(31, 31, MiningTileType.EMPTY, true);
      engine.doodadSubsystem.onTileRevealed(31, 31);
      tick(1);
      expect(lastTick().doodadsAdded).toEqual([[FLOOR, 31, 31, 0]]);
      tick(1);
      expect(lastTick().doodadsAdded).toBeUndefined();
    });

    it('marks a mirrored wall doodad with a fifth number', () => {
      place([at(WALL, 36, 30, true)]);
      engine.doodadSubsystem.onTileRevealed(36, 30);
      tick(1);
      expect(lastTick().doodadsAdded).toEqual([[WALL, 36, 30, 0, 1]]);
    });

    it('hands a client that joins later the doodads already revealed, and not the hidden or removed ones', () => {
      set(31, 31, MiningTileType.EMPTY, true);
      set(35, 30, MiningTileType.EMPTY, true);
      set(33, 30, MiningTileType.EMPTY, true);
      engine.damageTile(33, 29, hit()); // takes the ceiling doodad's roof away
      const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
      expect(state.doodadPlacements).toEqual([[AIR, 35, 30, 0], [FLOOR, 31, 31, 0]]);
    });

    it('also reveals through the engine when a player sees the ground', () => {
      engine.players.get(cid)!.playerBody.position = { x: 33.5, y: 30.5 };
      (engine as any).revealAndTrackTiles({ x: 33, y: 30 }, 4);
      tick(1);
      const sent = lastTick().doodadsAdded!.map((w) => w[0]).sort();
      expect(sent).toEqual([FLOOR, CEILING, WALL, AIR]);
    });
  });

  describe('removal when the anchor goes', () => {
    beforeEach(() => {
      for (let y = 30; y <= 31; y++) for (let x = 30; x <= 36; x++) engine.grid[y][x].revealed = true;
      for (const p of engine.doodadSubsystem.placements()) engine.doodadSubsystem.onTileRevealed(p.x, p.y);
      tick(1);
    });

    it('takes a floor doodad when the block under it is mined, and tells the clients', () => {
      engine.damageTile(31, 32, hit());
      expect(standing()).not.toContain('0@31,31');
      tick(1);
      expect(lastTick().doodadsRemoved).toEqual([[31, 31]]);
    });

    it('takes a ceiling doodad when the block over it goes, and a wall doodad when its wall goes', () => {
      engine.damageTile(33, 29, hit());
      engine.damageTile(29, 30, hit());
      expect(standing()).toEqual(['3@35,30', '0@31,31']);
      tick(1);
      expect(lastTick().doodadsRemoved).toEqual([[33, 30], [30, 30]]);
    });

    it('keeps free-floating doodads, and ones whose neighbours were mined', () => {
      engine.damageTile(34, 32, hit()); // floor next to the floor doodad
      engine.damageTile(33, 28, hit()); // two above the ceiling doodad's roof
      expect(standing()).toHaveLength(4);
      tick(1);
      expect(lastTick().doodadsRemoved).toBeUndefined();
    });

    it('goes when any one cell of a wide anchor goes', () => {
      place([{ typeIndex: FLOOR, x: 31, y: 31, variant: 0, flip: false }]);
      engine.doodadSubsystem = new MiningDoodadSubsystem((engine as any).worldView, [{ ...DEFS[0], width: 3 }, ...DEFS.slice(1)], [at(FLOOR, 31, 31)]);
      for (const p of engine.doodadSubsystem.placements()) engine.doodadSubsystem.onTileRevealed(p.x, p.y);
      engine.damageTile(33, 32, hit()); // the last of the three blocks under it
      expect(standing()).toEqual([]);
    });

    it('goes when a blast clears its anchor', () => {
      engine.explodeDynamite({ id: 'dyn', position: { x: 31, y: 33 }, explosionRadius: 2, ownerId: cid } as any);
      expect(standing()).not.toContain('0@31,31');
      expect(standing()).toContain('1@33,30'); // (the roof is out of reach)
    });

    it('goes when its block burns into something open, and when a rock lands in it', () => {
      (engine as any).worldView.pushTileUpdate({ x: 31, y: 32, type: MiningTileType.EMPTY, damageStage: 0 });
      expect(standing()).not.toContain('0@31,31');
      (engine as any).worldView.pushTileUpdate({ x: 35, y: 30, type: MiningTileType.ROCK });
      expect(standing()).not.toContain('3@35,30');
    });

    it('is not removed by cracks on its anchor, nor by a ladder, torch or bridge placed where it stands', () => {
      (engine as any).worldView.pushTileUpdate({ x: 31, y: 32, type: MiningTileType.DIRT, damageStage: 2 });
      for (const type of [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) {
        (engine as any).worldView.pushTileUpdate({ x: 35, y: 30, type });
      }
      expect(standing()).toHaveLength(4);
    });

    it('does not bring one back when a block is put where the anchor was', () => {
      engine.damageTile(31, 32, hit());
      (engine as any).worldView.pushTileUpdate({ x: 31, y: 32, type: MiningTileType.DIRT, damageStage: 0 });
      expect(standing()).not.toContain('0@31,31');
    });

    it('removes a doodad nobody had seen without a word', () => {
      place([at(FLOOR, 31, 31)]);
      engine.grid[31][31].revealed = false;
      engine.damageTile(31, 32, hit());
      tick(1);
      expect(lastTick().doodadsRemoved).toBeUndefined();
      expect(engine.doodadSubsystem.count).toBe(0);
    });
  });
});
