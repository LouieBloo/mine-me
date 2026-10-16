import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType, isTileSolid, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('placing and mining bridges', () => {
  const cid = 'bridge-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const tileAt = (x: number, y: number) => engine.grid[y][x].type;
  const tileUpdates = () => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').flatMap((c) => (c[1] as MiningStateTickPayload).revealedTiles ?? []);

  /** An open room x 16..28, y 17..20 over a dirt floor at row 21; the player stands at x = 22.5 on the floor. */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 22.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  });

  it('is a solid tile', () => {
    expect(isTileSolid(MiningTileType.BRIDGE)).toBe(true);
  });

  it('places a bridge in an empty cell within reach and tells clients', () => {
    expect(engine.placeBridge(cid, { x: 23, y: 19 })).toBe(true);
    expect(tileAt(23, 19)).toBe(MiningTileType.BRIDGE);
    tick();
    expect(tileUpdates()).toContainEqual(expect.objectContaining({ x: 23, y: 19, type: MiningTileType.BRIDGE }));
  });

  it('cannot go out of reach, over a block, over another bridge, or in an unrevealed cell', () => {
    expect(engine.canPlaceBridge(cid, { x: 27, y: 19 })).toBe(false); // too far
    expect(engine.canPlaceBridge(cid, { x: 22, y: 21 })).toBe(false); // dirt
    engine.placeBridge(cid, { x: 23, y: 19 });
    expect(engine.canPlaceBridge(cid, { x: 23, y: 19 })).toBe(false); // already a bridge
    engine.grid[19][21].revealed = false;
    expect(engine.canPlaceBridge(cid, { x: 21, y: 19 })).toBe(false);
  });

  it('cannot go on top of a player or a mob', () => {
    expect(engine.canPlaceBridge(cid, { x: 22, y: 20 })).toBe(false); // the player's own cell
    // A mob standing in the next cell
    const mob = { health: 10, mobBody: { position: { x: 23.5, y: 20.5 }, halfWidth: 0.3, halfHeight: 0.4 } } as any;
    engine.activeMobs.set('m', mob);
    expect(engine.canPlaceBridge(cid, { x: 23, y: 20 })).toBe(false);
    engine.activeMobs.delete('m');
    expect(engine.canPlaceBridge(cid, { x: 23, y: 20 })).toBe(true);
  });

  it('is walked on like a floor and cannot be passed from below', () => {
    expect(engine.placeBridge(cid, { x: 22, y: 19 })).toBe(true); // from the floor, in reach
    const body = me().playerBody;

    // From above: lands on it
    body.position = { x: 22.5, y: 17 - body.halfHeight };
    body.velocity = { x: 0, y: 0 };
    body.isGrounded = false;
    tick(30);
    expect(body.isGrounded).toBe(true);
    expect(body.position.y).toBeCloseTo(19 - body.halfHeight, 1);

    // From below: a full-power jump stops against its underside (y = 20)
    body.position = { x: 22.5, y: 21 - body.halfHeight };
    body.velocity = { x: 0, y: -30 };
    body.isGrounded = false;
    tick(40);
    expect(body.position.y).toBeGreaterThan(20);
  });

  it('mining it breaks it in one hit of a basic tool and gives a bridge back', () => {
    engine.placeBridge(cid, { x: 23, y: 19 });
    expect(engine.dataManager.getBlockMaxHealth(MiningTileType.BRIDGE)).toBeLessThanOrEqual(25);
    const result = engine.damageTile(23, 19, { amount: 25, type: 'mining', source: { kind: 'player', id: cid } });
    expect(result.destroyed).toBe(true);
    expect(tileAt(23, 19)).toBe(MiningTileType.EMPTY);
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
    expect(engine.bridgePlacementProblem(cid, { x: 22, y: 20 })).toBe(null); // 2.0 tiles away: past 1.85, inside the slack
    expect(engine.bridgePlacementProblem(cid, { x: 24, y: 20 })).toBe('out_of_reach');
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
      engine.grid[20][23] = { type: t, revealed: true };
    }
  });

  it.each([MiningTileType.DIRT, MiningTileType.ROCK, MiningTileType.CHEST, MiningTileType.COPPERIUM, MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE])(
    'refuses a ladder, torch and bridge over tile type %i',
    (type) => {
      engine.grid[20][23] = { type, revealed: true };
      expect(engine.canPlaceLadder(cid, { x: 23, y: 20 })).toBe(false);
      expect(engine.canPlaceTorch(cid, { x: 23, y: 20 })).toBe(false);
      expect(engine.canPlaceBridge(cid, { x: 23, y: 20 })).toBe(false);
    }
  );

  it('accepts all three in an empty tile', () => {
    engine.grid[20][23] = { type: MiningTileType.EMPTY, revealed: true };
    expect(engine.canPlaceLadder(cid, { x: 23, y: 20 })).toBe(true);
    expect(engine.canPlaceTorch(cid, { x: 23, y: 20 })).toBe(true);
    expect(engine.canPlaceBridge(cid, { x: 23, y: 20 })).toBe(true);
  });
});
