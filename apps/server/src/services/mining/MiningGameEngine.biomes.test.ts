import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BiomeDefinition, MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';
import { MiningDataManager, type GameDefinitions } from './subsystems/MiningDataManager';

const biome = (key: string, over: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: `b_${key}`, key, name: key, isDefault: false, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 24, ...over,
});

describe('biomes in a mining room', () => {
  let original: MiningDataManager;
  let engine: MiningGameEngine | undefined;

  /** The loaded definitions again, plus these biomes. */
  const install = (biomes: BiomeDefinition[]) => {
    const raw = original as unknown as { items: GameDefinitions['items']; mobs: GameDefinitions['mobs']; blocksByTypeKey: Map<string, GameDefinitions['blocks'][number]> };
    MiningDataManager.initialize({
      items: raw.items,
      mobs: raw.mobs,
      blocks: [...raw.blocksByTypeKey.values()],
      fluids: original.getFluids(),
      gases: original.getGases(),
      biomes,
    });
  };
  const make = (mapConfig: Record<string, unknown> = {}) => {
    engine = new MiningGameEngine({
      characterId: 'biome-char', cityId: 'c', seed: 4, socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    return engine;
  };

  beforeEach(() => {
    original = MiningDataManager.getInstance();
  });
  afterEach(() => {
    engine?.stop();
    engine = undefined;
    install([]);
  });

  it('keeps a biome field for the room: the default everywhere when no biomes are defined', () => {
    install([]);
    const field = make().biomeField!;
    expect(field.hasBiomes).toBe(false);
    expect(field.biomes).toHaveLength(1);
  });

  it('builds the field from the defined biomes, shifted down by the sky rows', () => {
    install([biome('frozen', { minDepth: 30 })]);
    const room = make({ skyRows: 10 });
    const field = room.biomeField!;
    expect(field.hasBiomes).toBe(true);
    expect(field.totalHeight).toBe(room.grid.length);
    // Open sky is the default biome
    const frozen = field.biomes.findIndex((b) => b.key === 'frozen');
    for (let x = 0; x < room.grid[0].length; x += 9) expect(field.primaryAt(x, 3)).not.toBe(frozen);
  });

  it('draws cavern mobs from the biome spawn list instead of the map list', () => {
    install([biome('mariolands', { weight: 1000, mobSpawns: { Mario: 1 } })]);
    const room = make({ mobSpawnCount: 5, allowedMobIds: ['Mole Person'] });
    const names = room.getActiveMobs().map((m) => m.name);
    expect(names).toHaveLength(5);
    expect(new Set(names)).toEqual(new Set(['Mario']));
  });

  it('keeps the map mob list in a biome with no spawn list of its own', () => {
    install([biome('plain', { weight: 1000 }), biome('other', { weight: 0.001, mobSpawns: { Mario: 1 } })]);
    const room = make({ mobSpawnCount: 4, allowedMobIds: ['Mole Person', 'Mario'] });
    expect(room.getActiveMobs()).toHaveLength(4);
  });

  it('spawns mobs from biome lists even when the map names none', () => {
    install([biome('mariolands', { weight: 1000, mobSpawns: { Mario: 1 } })]);
    expect(make({ mobSpawnCount: 3 }).getActiveMobs().map((m) => m.name)).toEqual(['Mario', 'Mario', 'Mario']);
  });

  describe('on the wire', () => {
    const cid = 'biome-wire-char';
    let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
    const room = () => {
      socket = { connected: true, emit: vi.fn() };
      engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 4, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any });
      return engine;
    };

    it('sends nothing about biomes when the mine is one biome', () => {
      install([]);
      const state = MiningSessionManager.getInstance().buildClientState(room(), cid);
      expect(state.biomes).toBeUndefined();
      expect(state.grid.flat().some((tile) => tile.biome !== undefined)).toBe(false);
    });

    it('describes each biome once (its look only) and tags only the revealed cells', () => {
      install([biome('frozen', { minDepth: 10, ambient: { tint: '#99bbff' }, mobSpawns: { Mario: 1 } })]);
      const state = MiningSessionManager.getInstance().buildClientState(room(), cid);
      expect(state.biomes).toEqual([
        { index: 0, key: 'default', name: 'Default', ambient: {} },
        { index: 1, key: 'frozen', name: 'frozen', ambient: { tint: '#99bbff' } },
      ]);
      let revealed = 0;
      for (const row of state.grid) {
        for (const tile of row) {
          if (tile.revealed) {
            revealed++;
            expect(tile.biome).toBeGreaterThanOrEqual(0);
            expect(tile.biome).toBeLessThan(2);
          } else {
            expect(tile.biome).toBeUndefined();
          }
        }
      }
      expect(revealed).toBeGreaterThan(0);
    });

    it('tags a revealed cell with its biome and never one the fog of war still hides', () => {
      install([biome('frozen', { weight: 1000 })]);
      const r = room();
      const frozen = r.biomeField!.biomes.findIndex((b) => b.key === 'frozen');
      r.players.get(cid)!.playerBody.position = { x: 60.5, y: 60.5 };
      (r as any).revealAndTrackTiles({ x: 60.5, y: 60.5 }, 2);
      (r as any).tick(1 / 30);
      const ticks: MiningStateTickPayload[] = socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
      const revealed = ticks.flatMap((t) => t.revealedTiles ?? []);
      expect(revealed.length).toBeGreaterThan(0);
      for (const tile of revealed) expect(tile.biome).toBe(frozen);
      // Only revealed cells are tagged in a fresh state, and only those
      const state = MiningSessionManager.getInstance().buildClientState(r, cid);
      expect(state.grid[100][100].revealed).toBe(false);
      expect(state.grid[100][100].biome).toBeUndefined();
    });
  });
  it('lays the biomes out in a row in the sandbox (ticket 142), and tells the client about them', () => {
    install([biome('default', { isDefault: true }), biome('icy', { minDepth: 10 }), biome('hot', { minDepth: 20 })]);
    const e = new MiningGameEngine({
      characterId: 'sbx-biomes', cityId: 'c', seed: 1, gameMode: 'sandbox', socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { surfaceDummyMobId: 'mob_target_dummy', mobSpawnCount: 0 },
    });
    engine = e;
    expect(e.clientBiomes()?.map((b) => b.key)).toEqual(['default', 'hot', 'icy']);
    const width = e.grid[0].length;
    const row = e.surfaceRow + 40;
    const keyAt = (x: number) => e.clientBiomes()![e.biomeGrid![row * width + x]].key;
    expect([keyAt(3), keyAt(Math.floor(width / 2)), keyAt(width - 3)]).toEqual(['default', 'icy', 'hot']);
  });
});
