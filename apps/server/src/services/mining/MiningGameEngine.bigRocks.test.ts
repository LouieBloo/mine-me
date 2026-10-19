import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType, pieceCells, type MiningMapConfigData } from '@mine-me/shared';
import { MiningRockEntity } from './physics/MiningRockEntity';

describe('rocks bigger than one cell', () => {
  const cid = 'big-rock-char';
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let engine: MiningGameEngine;

  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const hurt = () => socket.emit.mock.calls.filter((c: any[]) => c[0] === 'player_damaged').map((c: any[]) => c[1]);
  const typeAt = (x: number, y: number) => engine.grid[y][x].type;
  const falling = () => engine.activeRocks;

  /** Open chamber x 12..32, y 3..39 over a solid floor at row 40 (walls at 11 and 33); the player stands at x 22.5. */
  const chamber = () => {
    for (let x = 11; x <= 33; x++) {
      for (let y = 3; y <= 40; y++) {
        const solid = y === 40 || x === 11 || x === 33;
        engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
        if (solid) engine.rigidWorld.addTileCollider(x, y);
        else engine.rigidWorld.removeTileCollider(x, y);
      }
    }
    const body = me().playerBody;
    body.position = { x: 22.5, y: 40 - body.halfHeight };
    body.isGrounded = true;
  };

  /** Puts a rock of `width` x `height` with its top-left cell at (x, y), as the generator does. */
  const placeRock = (x: number, y: number, width: number, height: number) => {
    const big = width > 1 || height > 1;
    for (const cell of pieceCells({ x, y }, { width, height }, true)) {
      engine.grid[cell.y][cell.x] = { type: MiningTileType.ROCK, revealed: true, ...(big ? { piece: cell.offset } : {}) };
      engine.rigidWorld.addTileCollider(cell.x, cell.y);
    }
  };
  /** A floor of dirt under the rock, one cell high, `width` wide from x. */
  const ledge = (x: number, y: number, width: number) => {
    for (let i = x; i < x + width; i++) {
      engine.grid[y][i] = { type: MiningTileType.DIRT, revealed: true };
      engine.rigidWorld.addTileCollider(i, y);
    }
  };
  const clear = (x: number, y: number) => {
    engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
    engine.rigidWorld.removeTileCollider(x, y);
    engine.rockSubsystem.checkAndTriggerFallingRocks(x, y);
  };

  const start = (mapConfig: Partial<MiningMapConfigData> = {}) => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 7, socket: socket as any, maxHealth: 100000,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    chamber();
  };

  beforeEach(() => start());

  describe('falling', () => {
    it('stays up while any cell under it is still solid', () => {
      ledge(20, 30, 3);
      placeRock(20, 27, 3, 3);
      clear(20, 30);
      clear(21, 30);
      expect(falling()).toHaveLength(0);
      expect(typeAt(21, 28)).toBe(MiningTileType.ROCK);
    });

    it('falls as one body when nothing is left under it, and leaves no cell behind', () => {
      ledge(20, 30, 3);
      placeRock(20, 27, 3, 3);
      clear(20, 30);
      clear(21, 30);
      clear(22, 30);
      expect(falling()).toHaveLength(1);
      expect(falling()[0]).toMatchObject({ cellsWide: 3, cellsHigh: 3 });
      for (let y = 27; y < 30; y++) for (let x = 20; x < 23; x++) expect(typeAt(x, y)).toBe(MiningTileType.EMPTY);
    });

    it('lands on the floor as the same rock: every cell is rock again, with its place and size', () => {
      ledge(20, 30, 3);
      placeRock(20, 27, 3, 3);
      for (let x = 20; x < 23; x++) clear(x, 30);
      tick(200);
      expect(falling()).toHaveLength(0);
      // The floor is row 40, so the rock rests on rows 37..39
      for (let oy = 0; oy < 3; oy++) {
        for (let ox = 0; ox < 3; ox++) {
          expect(engine.grid[37 + oy][20 + ox]).toMatchObject({ type: MiningTileType.ROCK, piece: [ox, oy, 3, 3] });
          expect(engine.rigidWorld.hasTileCollider(20 + ox, 37 + oy)).toBe(true);
        }
      }
    });

    it('a 3 x 1 rock falls and lands flat', () => {
      ledge(20, 30, 3);
      placeRock(20, 29, 3, 1);
      for (let x = 20; x < 23; x++) clear(x, 30);
      tick(200);
      for (let x = 20; x < 23; x++) expect(engine.grid[39][x]).toMatchObject({ type: MiningTileType.ROCK, piece: [x - 20, 0, 3, 1] });
    });

    it('a rock resting on it falls too, even when it only sits on the edge', () => {
      ledge(20, 30, 3);
      placeRock(20, 28, 3, 2);
      placeRock(22, 26, 1, 2); // on the right-hand cell of the big rock, a 1 x 2 hangs off it only by its base
      for (let x = 20; x < 23; x++) clear(x, 30);
      expect(falling()).toHaveLength(2);
      expect(typeAt(22, 26)).toBe(MiningTileType.EMPTY);
    });

    it('a rock held up by a neighbouring rock does not fall', () => {
      ledge(20, 30, 3);
      placeRock(20, 28, 3, 2);
      placeRock(20, 27, 1, 1);
      clear(21, 30);
      expect(falling()).toHaveLength(0);
      expect(typeAt(20, 27)).toBe(MiningTileType.ROCK);
    });

    it('a single-cell rock still behaves as before: no piece, falls when its cell below goes', () => {
      ledge(20, 30, 1);
      placeRock(20, 29, 1, 1);
      clear(20, 30);
      expect(falling()).toHaveLength(1);
      expect(falling()[0]).toMatchObject({ cellsWide: 1, cellsHigh: 1 });
      tick(120);
      expect(engine.grid[39][20]).toEqual({ type: MiningTileType.ROCK, revealed: true });
    });
  });

  describe('whole-rock removal', () => {
    it('clearing one cell of a rock (a blast, say) removes all its cells', () => {
      placeRock(20, 38, 2, 2);
      engine.blockSubsystem.clearPieceSiblings(20, 38);
      expect(typeAt(21, 38)).toBe(MiningTileType.EMPTY);
      expect(typeAt(20, 39)).toBe(MiningTileType.EMPTY);
      expect(typeAt(21, 39)).toBe(MiningTileType.EMPTY);
    });

    it('does not touch a neighbouring rock', () => {
      placeRock(20, 38, 2, 2);
      placeRock(22, 38, 2, 2);
      engine.blockSubsystem.clearPieceSiblings(20, 38);
      expect(typeAt(22, 38)).toBe(MiningTileType.ROCK);
      expect(typeAt(23, 39)).toBe(MiningTileType.ROCK);
    });
  });

  describe('damage grows with mass', () => {
    /** Drops a rock of the given size from `fromY` straight onto the player and returns the damage it did. */
    const dropOnPlayer = (width: number, height: number, fromY: number) => {
      const left = 22 - Math.floor((width - 1) / 2);
      const rock = new MiningRockEntity(`rock_${width}x${height}`, left, fromY, engine.rigidWorld, {
        width, height,
        gravityScale: engine.rigidWorld.config.rockGravityScale,
        restitution: engine.rigidWorld.config.rockRestitution,
      });
      engine.rockSubsystem.activeRocks.push(rock);
      for (let i = 0; i < 200 && !rock.hasSettled; i++) {
        me().playerBody.position = { x: 22.5, y: 40 - me().playerBody.halfHeight };
        tick();
      }
      return hurt().reduce((sum: number, e: any) => sum + e.damage, 0);
    };

    it('a bigger rock does more damage than a smaller one dropped from the same height', () => {
      start({ rockDamageMax: 0 });
      const small = dropOnPlayer(1, 1, 20);
      start({ rockDamageMax: 0 });
      const wide = dropOnPlayer(3, 1, 20);
      start({ rockDamageMax: 0 });
      const big = dropOnPlayer(3, 3, 20);
      expect(small).toBeGreaterThan(0);
      expect(wide).toBeGreaterThan(small * 1.8);
      expect(big).toBeGreaterThan(wide * 1.8);
    });

    it('a 3 x 3 rock does about nine times the damage of a 1 x 1 at the same speed', () => {
      start({ rockDamageMax: 0 });
      const small = dropOnPlayer(1, 1, 20);
      start({ rockDamageMax: 0 });
      const big = dropOnPlayer(3, 3, 20);
      expect(big / small).toBeGreaterThan(6);
      expect(big / small).toBeLessThan(12);
    });

    it('a big rock hurts a player standing under its edge, which a single cell would miss', () => {
      start({ rockDamageMax: 0 });
      // The player is 1.2 cells off the rock's centre line: outside a 1 x 1 rock's reach, inside a 3 x 3's
      const rock = new MiningRockEntity('edge', 21, 20, engine.rigidWorld, {
        width: 3, height: 3,
        gravityScale: engine.rigidWorld.config.rockGravityScale,
        restitution: engine.rigidWorld.config.rockRestitution,
      });
      engine.rockSubsystem.activeRocks.push(rock);
      for (let i = 0; i < 200 && !rock.hasSettled; i++) {
        me().playerBody.position = { x: 23.7, y: 40 - me().playerBody.halfHeight };
        tick();
      }
      expect(hurt().length).toBeGreaterThan(0);
    });
  });
});
