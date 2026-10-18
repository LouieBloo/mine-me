import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BLOCK_SCALE, MiningTileType, getTileFootprint, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

const S = BLOCK_SCALE;
const PIECE_TYPES = [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE];

describe('placeables are pieces of BLOCK_SCALE x BLOCK_SCALE cells', () => {
  const cid = 'piece-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const typeAt = (x: number, y: number) => engine.grid[y][x].type;
  const place = (type: MiningTileType, at: { x: number; y: number }) =>
    type === MiningTileType.LADDER ? engine.placeLadder(cid, at)
      : type === MiningTileType.TORCH ? engine.placeTorch(cid, at, 'torch')
        : engine.placeBridge(cid, at);
  const cellsOf = (type: MiningTileType) => {
    const found: string[] = [];
    for (let y = 0; y < engine.grid.length; y++) for (let x = 0; x < engine.grid[0].length; x++) if (engine.grid[y][x].type === type) found.push(`${x},${y}`);
    return found;
  };
  const open = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
  };

  /** An open room x 10..34, y 8..20 over a dirt floor at row 21; the player stands at x = 22.5 on the floor. */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    open(10, 8, 34, 20);
    for (let x = 10; x <= 34; x++) engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    me().playerBody.position = { x: 18.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  });

  it('knows its footprint from shared data: one block of the original size, one cell for everything else', () => {
    for (const type of PIECE_TYPES) expect(getTileFootprint(type)).toEqual({ width: S, height: S });
    expect(getTileFootprint(MiningTileType.DIRT)).toEqual({ width: 1, height: 1 });
  });

  it.each(PIECE_TYPES)('type %i fills a full square centred on the cursor, each cell knowing its place in it', (type) => {
    expect(place(type, { x: 22, y: 15 })).toBe(true);
    const half = Math.floor(S / 2);
    expect(cellsOf(type)).toHaveLength(S * S);
    for (let oy = 0; oy < S; oy++) {
      for (let ox = 0; ox < S; ox++) {
        const tile = engine.grid[15 - half + oy][22 - half + ox];
        expect(tile.type).toBe(type);
        expect(tile.piece).toEqual([ox, oy]);
      }
    }
  });

  it.each(PIECE_TYPES)('type %i is sent to clients cell by cell with its offsets', (type) => {
    place(type, { x: 22, y: 15 });
    tick();
    const sent = socket.emit.mock.calls
      .filter((c) => c[0] === 'mining_state_tick')
      .flatMap((c) => (c[1] as MiningStateTickPayload).revealedTiles ?? [])
      .filter((t) => t.type === type);
    expect(sent).toHaveLength(S * S);
    expect(sent.every((t) => Array.isArray(t.piece))).toBe(true);
  });

  it('is nudged to the nearest spot that fits when the middle spot does not', () => {
    // The cursor is on the floor row's neighbour: a piece centred there would sink into the dirt
    expect(place(MiningTileType.LADDER, { x: 22, y: 20 })).toBe(true);
    expect(typeAt(22, 20)).toBe(MiningTileType.LADDER); // still covers the cursor cell
    expect(cellsOf(MiningTileType.LADDER)).toHaveLength(S * S);
    for (const key of cellsOf(MiningTileType.LADDER)) expect(Number(key.split(',')[1])).toBeLessThanOrEqual(20);
  });

  it('is refused, changing nothing, when no spot around the cursor is wholly empty', () => {
    // A gap one cell narrower than the piece
    for (let y = 8; y <= 20; y++) for (let x = 10; x <= 34; x++) engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: true };
    open(20, 8, 20 + S - 2, 20);
    for (const type of PIECE_TYPES) {
      expect(place(type, { x: 20, y: 15 })).toBe(false);
      expect(cellsOf(type)).toEqual([]);
    }
  });

  it('is refused when one cell of the piece is still in the fog', () => {
    engine.grid[16][23].revealed = false;
    expect(engine.bridgePlacementProblem(cid, { x: 23, y: 16 })).toBe('hidden');
    expect(place(MiningTileType.TORCH, { x: 23, y: 16 })).toBe(false);
  });

  it('a bridge is refused while a body is in any of its cells, and then needs a free spot', () => {
    me().playerBody.position = { x: 18.5, y: 19.3 };
    const anchorProblem = engine.bridgePlacementProblem(cid, { x: 18, y: 20 });
    expect(anchorProblem).toBe('body_in_way');
    expect(engine.placeBridge(cid, { x: 18, y: 20 })).toBe(false);
    expect(cellsOf(MiningTileType.BRIDGE)).toEqual([]);
  });

  it('measures reach to the middle of the piece, not to one cell', () => {
    me().playerBody.position = { x: 12.5, y: 21 - me().playerBody.halfHeight };
    expect(engine.bridgePlacementProblem(cid, { x: 12, y: 15 })).toBe(null);
    expect(engine.bridgePlacementProblem(cid, { x: 33, y: 15 })).toBe('out_of_reach');
  });

  describe('a piece goes whole', () => {
    it('mining one cell of a bridge removes every cell, drops one item, and removes the colliders', () => {
      engine.placeBridge(cid, { x: 22, y: 15 });
      const world = engine.rigidWorld as any;
      const result = engine.damageTile(23, 16, { amount: 999, type: 'mining', source: { kind: 'player', id: cid } });
      expect(result.destroyed).toBe(true);
      expect(cellsOf(MiningTileType.BRIDGE)).toEqual([]);
      expect(engine.droppedItems.map((d) => d.itemId)).toEqual(['item_bridge']);
      expect(world.hasTileCollider?.(22, 15) ?? false).toBe(false);
      tick();
      const cleared = socket.emit.mock.calls
        .filter((c) => c[0] === 'mining_state_tick')
        .flatMap((c) => (c[1] as MiningStateTickPayload).revealedTiles ?? [])
        .filter((t) => t.type === MiningTileType.EMPTY);
      expect(cleared.length).toBeGreaterThanOrEqual(S * S);
    });

    it('a blast that reaches one cell of a ladder or torch takes the whole piece, and a bridge still drops once', () => {
      me().playerBody.position = { x: 20.5, y: 21 - me().playerBody.halfHeight };
      expect(engine.placeLadder(cid, { x: 15, y: 15 })).toBe(true);
      expect(engine.placeTorch(cid, { x: 22, y: 15 }, 'torch')).toBe(true);
      expect(engine.placeBridge(cid, { x: 26, y: 15 })).toBe(true);
      // A tiny blast on the far corner of each piece
      for (const [x, y] of [[15 - 1, 15 - 1], [22 + 1, 15 + 1], [26 + 1, 15 + 1]]) {
        engine.explodeDynamite({ id: `d${x}`, position: { x, y }, explosionRadius: 1, ownerId: cid } as any);
      }
      for (const type of PIECE_TYPES) expect(cellsOf(type)).toEqual([]);
      expect(engine.droppedItems.filter((d) => d.itemId === 'item_bridge')).toHaveLength(1);
    });

    it('a fire burning one cell of a bridge takes the rest, with no drop', () => {
      engine.placeBridge(cid, { x: 22, y: 15 });
      engine.blockSubsystem.burnBlock(21, 14);
      expect(cellsOf(MiningTileType.BRIDGE)).toEqual([]);
      expect(engine.droppedItems).toHaveLength(0);
    });

    it('a block formed by a reaction in one cell of a ladder takes the rest of the ladder', () => {
      engine.placeLadder(cid, { x: 22, y: 15 });
      expect(engine.blockSubsystem.placeBlockFromReaction(22, 15, 'LAVAROCK')).toBe(true);
      expect(typeAt(22, 15)).toBe(MiningTileType.LAVAROCK);
      expect(cellsOf(MiningTileType.LADDER)).toEqual([]);
    });

    it('does not touch a neighbouring piece of the same kind', () => {
      engine.placeBridge(cid, { x: 22 - S, y: 15 });
      engine.placeBridge(cid, { x: 22 + 1, y: 15 });
      const before = cellsOf(MiningTileType.BRIDGE).length;
      expect(before).toBe(2 * S * S);
      engine.damageTile(22 - S, 15, { amount: 999, type: 'mining', source: { kind: 'player', id: cid } });
      expect(cellsOf(MiningTileType.BRIDGE)).toHaveLength(S * S);
    });
  });

  describe('torch', () => {
    it('is one ignition source, in the middle of the piece', () => {
      engine.placeTorch(cid, { x: 22, y: 15 }, 'torch');
      const torches = (engine.ignitionSubsystem as any).torches as Map<number, string>;
      expect(torches.size).toBe(1);
      const width = engine.grid[0].length;
      const [key] = [...torches.keys()];
      expect([key % width, Math.floor(key / width)]).toEqual([22, 15]);
    });
  });

  describe('ladder', () => {
    it('can be climbed from any cell of its width', () => {
      engine.placeLadder(cid, { x: 22, y: 15 });
      const half = Math.floor(S / 2);
      for (const x of [22 - half, 22, 22 + half]) {
        me().playerBody.position = { x: x + 0.5, y: 15.5 };
        me().inputs = { ...me().inputs, up: true };
        tick(2);
        expect(me().playerBody.isOnLadder).toBe(true);
      }
    });
  });
});
