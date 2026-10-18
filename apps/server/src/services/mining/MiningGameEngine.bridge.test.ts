import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BLOCK_SCALE, MiningTileType, isTileSolid, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('placing and mining bridges', () => {
  const cid = 'bridge-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const tileAt = (x: number, y: number) => engine.grid[y][x].type;
  const tileUpdates = () => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').flatMap((c) => (c[1] as MiningStateTickPayload).revealedTiles ?? []);

  /** An open room x 10..34, y 8..20 over a dirt floor at row 21; the player (1.25 x 1.75 tiles) stands at x = 22.5 on the floor. */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let x = 10; x <= 34; x++) {
      for (let y = 8; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 22.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  });

  it('is a solid tile', () => {
    expect(isTileSolid(MiningTileType.BRIDGE)).toBe(true);
  });

  it('places a bridge piece around the cursor within reach and tells clients', () => {
    expect(engine.placeBridge(cid, { x: 25, y: 19 })).toBe(true);
    expect(tileAt(25, 19)).toBe(MiningTileType.BRIDGE);
    tick();
    const updates = tileUpdates().filter((u) => u.type === MiningTileType.BRIDGE);
    expect(updates).toHaveLength(BLOCK_SCALE * BLOCK_SCALE);
    expect(updates).toContainEqual(expect.objectContaining({ x: 25, y: 19, piece: [1, 1] }));
  });

  it('cannot go out of reach, over a block, over another bridge, or in an unrevealed cell', () => {
    expect(engine.canPlaceBridge(cid, { x: 31, y: 19 })).toBe(false); // too far
    expect(engine.canPlaceBridge(cid, { x: 22, y: 21 })).toBe(false); // dirt
    engine.placeBridge(cid, { x: 25, y: 19 });
    expect(engine.canPlaceBridge(cid, { x: 25, y: 19 })).toBe(false); // already a bridge
    engine.grid[19][19].revealed = false;
    expect(engine.canPlaceBridge(cid, { x: 19, y: 19 })).toBe(false);
    expect(engine.canPlaceBridge(cid, { x: 12, y: 19 })).toBe(false); // too far
  });

  it('cannot go on top of a player or a mob', () => {
    expect(engine.canPlaceBridge(cid, { x: 22, y: 20 })).toBe(false); // the player's own cell
    // A mob standing in the next cell
    const mob = { health: 10, mobBody: { position: { x: 25.5, y: 20.1 }, halfWidth: 0.6, halfHeight: 0.85 } } as any;
    engine.activeMobs.set('m', mob);
    expect(engine.canPlaceBridge(cid, { x: 25, y: 20 })).toBe(false);
    engine.activeMobs.delete('m');
    expect(engine.canPlaceBridge(cid, { x: 25, y: 20 })).toBe(true);
  });

  it('is walked on like a floor and cannot be passed from below', () => {
    // High enough that the player (about 2.7 tiles tall) can stand under it
    expect(engine.placeBridge(cid, { x: 24, y: 15 })).toBe(true); // from the floor, in reach; covers rows 14-16
    const body = me().playerBody;

    // From above: lands on it
    body.position = { x: 24.5, y: 10 };
    body.velocity = { x: 0, y: 0 };
    body.isGrounded = false;
    tick(30);
    expect(body.isGrounded).toBe(true);
    expect(body.position.y).toBeCloseTo(14 - body.halfHeight, 1);

    // From below: a full-power jump stops against its underside (y = 17)
    body.position = { x: 24.5, y: 21 - body.halfHeight };
    body.velocity = { x: 0, y: -30 };
    body.isGrounded = false;
    tick(40);
    expect(body.position.y - body.halfHeight).toBeGreaterThan(17 - 0.05);
  });

  it('mining a cell of it breaks the whole piece in one hit of a basic tool and gives one bridge back', () => {
    engine.placeBridge(cid, { x: 25, y: 19 });
    expect(engine.dataManager.getBlockMaxHealth(MiningTileType.BRIDGE)).toBeLessThanOrEqual(25);
    const result = engine.damageTile(25, 19, { amount: 25, type: 'mining', source: { kind: 'player', id: cid } });
    expect(result.destroyed).toBe(true);
    for (let y = 18; y <= 20; y++) for (let x = 24; x <= 26; x++) expect(tileAt(x, y)).toBe(MiningTileType.EMPTY);
    expect(engine.droppedItems.map((d) => d.itemId)).toEqual(['item_bridge']);
  });
});

describe('laying a bridge while running', () => {
  const cid = 'run-char';
  let engine: MiningGameEngine;
  const me = () => engine.players.get(cid)!;
  const tick = () => (engine as any).tick(1 / 30);

  /** A floor at row 21 for x 16..23, then a gap (empty down to row 25) until a far ledge at x 30. */
  beforeEach(() => {
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let x = 14; x <= 32; x++) {
      for (let y = 15; y <= 26; y++) {
        const solid = y === 26 || (y >= 21 && (x <= 23 || x >= 30));
        engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        if (solid) engine.rigidWorld.addTileCollider(x, y);
        else engine.rigidWorld.removeTileCollider(x, y);
      }
    }
    me().playerBody.position = { x: 20.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  });

  it('every bridge laid in the gap ahead of a running player is accepted, and they cross it', () => {
    const refused: string[] = [];
    for (let i = 0; i < 400 && me().playerBody.position.x < 30.5; i++) {
      me().inputs = { ...me().inputs, right: true };
      const aheadX = Math.floor(me().playerBody.position.x) + 1;
      if (aheadX >= 24 && aheadX <= 29 && engine.grid[21][aheadX].type === MiningTileType.EMPTY) {
        const problem = engine.bridgePlacementProblem(cid, { x: aheadX, y: 21 });
        if (problem) refused.push(`${i}:${aheadX}:${problem}`);
        else engine.placeBridge(cid, { x: aheadX, y: 21 });
      }
      tick();
    }
    expect(refused).toEqual([]);
    expect(me().playerBody.position.x).toBeGreaterThan(30);
    expect(me().playerBody.position.y).toBeLessThan(21);
  });

  it('allows a little extra reach for a player whose server position trails their screen, but not far', () => {
    me().playerBody.position = { x: 20.5, y: 21 - me().playerBody.halfHeight };
    expect(engine.bridgePlacementProblem(cid, { x: 26, y: 20 })).toBe(null); // 6.0 tiles away: past the 5.55 reach, inside the 1.8 slack
    expect(engine.bridgePlacementProblem(cid, { x: 29, y: 20 })).toBe('out_of_reach');
  });

  it('says why a bridge was refused', () => {
    engine.grid[20][22] = { type: MiningTileType.DIRT, revealed: true };
    engine.grid[20][21] = { type: MiningTileType.EMPTY, revealed: false };
    expect(engine.bridgePlacementProblem(cid, { x: 22, y: 20 })).toBe('occupied');
    expect(engine.bridgePlacementProblem(cid, { x: 21, y: 20 })).toBe('hidden');
    expect(engine.bridgePlacementProblem(cid, { x: 20, y: 20 })).toBe('body_in_way');
    expect(engine.bridgePlacementProblem(cid, { x: -1, y: 20 })).toBe('out_of_bounds');
  });
});

describe('buildables only go into empty tiles', () => {
  const cid = 'build-char';
  let engine: MiningGameEngine;
  beforeEach(() => {
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
    engine.players.get(cid)!.playerBody.position = { x: 22.5, y: 20.5 };
    for (const t of [MiningTileType.DIRT, MiningTileType.ROCK, MiningTileType.CHEST, MiningTileType.COPPERIUM, MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) {
      engine.grid[20][25] = { type: t, revealed: true };
    }
  });

  it.each([MiningTileType.DIRT, MiningTileType.ROCK, MiningTileType.CHEST, MiningTileType.COPPERIUM, MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE])(
    'refuses a ladder, torch and bridge over tile type %i',
    (type) => {
      engine.grid[20][25] = { type, revealed: true };
      expect(engine.canPlaceLadder(cid, { x: 25, y: 20 })).toBe(false);
      expect(engine.canPlaceTorch(cid, { x: 25, y: 20 })).toBe(false);
      expect(engine.canPlaceBridge(cid, { x: 25, y: 20 })).toBe(false);
    }
  );

  it('accepts all three in an empty tile', () => {
    for (let y = 18; y <= 22; y++) for (let x = 23; x <= 27; x++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
    expect(engine.canPlaceLadder(cid, { x: 25, y: 20 })).toBe(true);
    expect(engine.canPlaceTorch(cid, { x: 25, y: 20 })).toBe(true);
    expect(engine.canPlaceBridge(cid, { x: 25, y: 20 })).toBe(true);
  });
});
