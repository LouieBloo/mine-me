import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiningTileType, doodadRect, type BiomeDefinition, type DoodadDefinition } from '@mine-me/shared';
import { MiningGameEngine } from '../MiningGameEngine';
import { MiningSessionManager } from '../MiningSessionManager';
import { MiningDataManager, type GameDefinitions } from '../subsystems/MiningDataManager';
import { DOODAD_SCENES, DOODAD_SCENE_OPTIONS, findDoodadScene } from './doodadScenes';
import { doodadPlacementProblem } from './sandboxDoodads';
import { SANDBOX_BLOCK_SCALE } from './SandboxLayout';
import { SANDBOX_DOODAD_HIT_DAMAGE } from './SandboxTools';

const S = SANDBOX_BLOCK_SCALE;

const biome = (key: string, minDepth = 0, extra: Partial<BiomeDefinition> = {}): BiomeDefinition => ({
  id: `b_${key}`, key, name: key, isDefault: false, minDepth, maxDepth: null, weight: 1, noiseScale: 45, ...extra,
});
const BIOMES = [biome('default', 0, { isDefault: true }), biome('icy', 10), biome('hot', 20)];

const doodad = (key: string, anchor: DoodadDefinition['anchor'], over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: `d_${key}`, key, name: key, anchor, width: 2, height: 2, zOffset: 0, biomes: [], ...over,
});
const link = (biomeKey: string, density = 20) => ({ biomeId: `b_${biomeKey}`, biomeKey, weight: 1, density });
const DOODADS: DoodadDefinition[] = [
  doodad('floor_a', 'FLOOR', { sizeVariants: [{ width: 2, height: 2, weight: 1 }, { width: 3, height: 3, weight: 1 }] as any }),
  doodad('ceiling_a', 'CEILING'),
  doodad('wall_a', 'WALL', { width: 1, height: 3 }),
  doodad('air_a', 'AIR', { wander: { mode: 'FLUTTER', radius: 6, speed: 2, pauseMs: 300 } }),
  doodad('bug_a', 'FLOOR', { width: 1, height: 1, wander: { mode: 'CRAWL', radius: 6, speed: 2, pauseMs: 300 }, reacts: { strength: 0.5, radius: 3 } }),
];

describe('doodads in the sandbox (ticket 107)', () => {
  const cid = 'sbx-doodads';
  let original: MiningDataManager;
  let engine: MiningGameEngine | undefined;
  let doodadsInstalled: DoodadDefinition[];

  const install = (doodads: DoodadDefinition[], biomes: BiomeDefinition[] = []) => {
    doodadsInstalled = doodads;
    const raw = original as unknown as { items: GameDefinitions['items']; mobs: GameDefinitions['mobs']; blocksByTypeKey: Map<string, GameDefinitions['blocks'][number]> };
    MiningDataManager.initialize({
      items: raw.items, mobs: raw.mobs, blocks: [...raw.blocksByTypeKey.values()],
      fluids: original.getFluids(), gases: original.getGases(), biomes, doodads,
    });
  };
  const make = () => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 3, gameMode: 'sandbox', maxHealth: 100,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { surfaceDummyMobId: 'mob_target_dummy', mobSpawnCount: 0 },
    });
    return engine;
  };
  const tools = () => engine!.sandbox!;
  const idOf = (key: string) => `d_${key}`;
  const standing = () => engine!.doodadSubsystem.placements();
  const keyOf = (typeIndex: number) => engine!.doodadSubsystem.definitions[typeIndex].key;

  beforeEach(() => {
    original = MiningDataManager.getInstance();
  });
  afterEach(() => {
    engine?.stop();
    engine = undefined;
    install([], []);
  });

  describe('placing and removing by hand', () => {
    beforeEach(() => {
      install(DOODADS);
      make();
    });

    it('has no scenery by default, and lists the kinds the tool can place', () => {
      expect(standing()).toEqual([]);
      expect(tools().doodadOptions()?.map((d) => d.id).sort()).toEqual(DOODADS.map((d) => d.id).sort());
      expect(tools().doodadOptions()?.find((d) => d.id === idOf('wall_a'))?.anchor).toBe('WALL');
    });

    it('stands a floor doodad on the clicked tile: the middle of its bottom row on the ground', () => {
      const y = engine!.surfaceRow - 1; // the open row above the ground
      const x = 55 * 1; // ground to the left of the spawn, clear of the shaft
      expect(tools().placeDoodad(idOf('floor_a'), x, y)).toEqual({ ok: true });
      const [p] = standing();
      expect(keyOf(p.typeIndex)).toBe('floor_a');
      expect(p.y + 2 - 1).toBe(y); // bottom row is the clicked row
      expect(p.x).toBe(x - 0); // width 2: (2 - 1) / 2 floors to 0
    });

    it('hangs a ceiling doodad from the clicked tile in the hall', () => {
      const y = engine!.surfaceRow + 12 * S; // the hall's top row
      expect(tools().placeDoodad(idOf('ceiling_a'), 80, y)).toEqual({ ok: true });
      expect(standing()[0].y).toBe(y);
    });

    it('puts a wall doodad on the side that has a wall, mirrored on the right wall', () => {
      const y = engine!.surfaceRow + 13 * S;
      expect(tools().placeDoodad(idOf('wall_a'), 3, y)).toEqual({ ok: true }); // hall's left wall is at x 2
      expect(standing()[0].flip).toBe(false);
      const hallRight = 104 * S - 1;
      expect(tools().placeDoodad(idOf('wall_a'), hallRight, y)).toEqual({ ok: true });
      expect(standing().find((p) => p.x === hallRight)?.flip).toBe(true);
    });

    it('centres a free-floating doodad on the clicked tile', () => {
      const y = engine!.surfaceRow - 8;
      expect(tools().placeDoodad(idOf('air_a'), 60, y)).toEqual({ ok: true });
      expect(standing()[0].typeIndex).toBe(engine!.doodadSubsystem.definitions.findIndex((d) => d.key === 'air_a'));
    });

    it.each([
      ['a doodad that does not exist', ['nope', 60, 40], /Unknown doodad/],
      ['a tile off the map', [idOf('floor_a'), -1, 40], /inside the map/],
      ['a floor doodad with no floor', [idOf('floor_a'), 60, 5], /needs a floor/],
      ['a ceiling doodad with no ceiling', [idOf('ceiling_a'), 60, 5], /needs a ceiling|open space/],
      ['a wall doodad with no wall beside the click', [idOf('wall_a'), 60, 5], /needs a wall/],
      ['a doodad inside a block', [idOf('air_a'), 60, 36 + 5], /open space/],
    ])('refuses %s', (_name, [id, x, y], message) => {
      const res = tools().placeDoodad(id, x, y);
      expect(res.ok).toBe(false);
      expect((res as { error: string }).error).toMatch(message as RegExp);
      expect(standing()).toEqual([]);
    });

    it('refuses a second doodad on top of one, and a malformed request', () => {
      const y = engine!.surfaceRow - 1;
      tools().placeDoodad(idOf('floor_a'), 55, y);
      expect(tools().placeDoodad(idOf('floor_a'), 55, y)).toEqual({ ok: false, error: 'There is already a doodad there.' });
      expect(tools().placeDoodad(idOf('floor_a'), 'x', y).ok).toBe(false);
      expect(tools().placeDoodad(undefined, 55, y).ok).toBe(false);
      expect(standing()).toHaveLength(1);
    });

    it('removes the doodad under any tile of its footprint, and refuses where there is none', () => {
      const y = engine!.surfaceRow - 1;
      tools().placeDoodad(idOf('floor_a'), 55, y);
      expect(tools().removeDoodad(56, y - 1)).toEqual({ ok: true }); // the far corner of the 2x2
      expect(standing()).toEqual([]);
      expect(tools().removeDoodad(56, y - 1)).toEqual({ ok: false, error: 'There is no doodad there.' });
      expect(tools().removeDoodad('a', 1).ok).toBe(false);
    });

    it('tells clients about a placed doodad, and about its removal, through the normal wire', () => {
      const y = engine!.surfaceRow - 1;
      tools().placeDoodad(idOf('floor_a'), 55, y);
      expect(engine!.doodadSubsystem.takeChanges().added).toHaveLength(1);
      tools().removeDoodad(55, y);
      expect(engine!.doodadSubsystem.takeChanges().removed).toHaveLength(1);
    });

    it('a hand-placed doodad goes when its floor is mined (the same removal path as generated ones)', () => {
      const y = engine!.surfaceRow - 1;
      tools().placeDoodad(idOf('floor_a'), 55, y);
      engine!.grid[y + 1][55] = { type: MiningTileType.EMPTY, revealed: true };
      (engine as any).buildWorld().pushTileUpdate({ x: 55, y: y + 1, type: MiningTileType.EMPTY });
      expect(standing()).toEqual([]);
    });

    it('hits a doodad with health like a weapon, kills it, lets a hanging one fall and refuses the rest (ticket 143)', () => {
      install(DOODADS.map((d) => (d.key === 'bug_a' ? { ...d, health: 12 } : d)));
      make();
      const y = engine!.surfaceRow - 1;
      const hallTop = engine!.surfaceRow + 12 * S;
      tools().placeDoodad(idOf('bug_a'), 60, y);
      tools().placeDoodad(idOf('ceiling_a'), 80, hallTop);
      tools().placeDoodad(idOf('floor_a'), 55, y);
      const bug = engine!.doodadSubsystem.placementCovering(60, y)!;

      expect(tools().hitDoodad(60, y)).toEqual({ ok: true });
      expect(engine!.doodadSubsystem.healthAt(bug.x, bug.y)).toBe(12 - SANDBOX_DOODAD_HIT_DAMAGE);
      tools().hitDoodad(60, y);
      tools().hitDoodad(60, y);
      expect(standing().some((p) => keyOf(p.typeIndex) === 'bug_a')).toBe(false);

      expect(tools().hitDoodad(80, hallTop)).toEqual({ ok: true });
      expect(standing().some((p) => keyOf(p.typeIndex) === 'ceiling_a')).toBe(false);
      expect(engine!.doodadSubsystem.falling.list).toHaveLength(1);

      expect(tools().hitDoodad(55, y)).toEqual({ ok: false, error: 'That doodad has no health, so it cannot be hurt.' });
      expect(standing().some((p) => keyOf(p.typeIndex) === 'floor_a')).toBe(true);
      expect(tools().hitDoodad(70, y)).toEqual({ ok: false, error: 'There is no doodad there.' });
      expect(tools().hitDoodad('a', 1).ok).toBe(false);
    });

    it('clears every doodad', () => {
      const y = engine!.surfaceRow - 1;
      tools().placeDoodad(idOf('floor_a'), 55, y);
      tools().placeDoodad(idOf('bug_a'), 60, y);
      tools().clearDoodads();
      expect(standing()).toEqual([]);
    });
  });

  describe('running the generator on the sandbox map', () => {
    it('is off by default, and on after the toggle and a reset', () => {
      install(DOODADS.map((d) => ({ ...d, biomes: [link('default'), link('icy'), link('hot')] })), BIOMES);
      make();
      expect(standing()).toEqual([]);
      expect(tools().status(cid).doodadsGenerated).toBe(false);
      expect(tools().setDoodadGeneration(true)).toEqual({ ok: true });
      engine!.resetWorld();
      expect(standing().length).toBeGreaterThan(0);
      expect(tools().status(cid).doodadsGenerated).toBe(true);
      expect(tools().setDoodadGeneration(false)).toEqual({ ok: true });
      engine!.resetWorld();
      expect(standing()).toEqual([]);
    });

    it('refuses a setting that is not a yes or no', () => {
      install(DOODADS);
      make();
      expect(tools().setDoodadGeneration('yes').ok).toBe(false);
      expect(tools().setDoodadGeneration(undefined).ok).toBe(false);
    });

    it('is the same every time, and every doodad it makes fits the way a hand-placed one must', () => {
      install(DOODADS.map((d) => ({ ...d, biomes: [link('default')] })), BIOMES);
      const build = () => {
        make().sandboxDoodadsRequested = true;
        engine!.resetWorld();
        return standing();
      };
      const first = build();
      engine!.stop();
      expect(build()).toEqual(first);
      for (const p of first.filter((q) => engine!.doodadSubsystem.definitions[q.typeIndex].anchor !== 'AIR')) {
        // check against the finished map with the doodad itself out of the way (a footprint is open air)
        expect(doodadPlacementProblem(engine!.grid, engine!.doodadSubsystem.definitions[p.typeIndex], p)).toBeNull();
      }
    });

    it("draws each doodad's biome shares from the sandbox's biome bands: one linked only to a biome stands only in that band", () => {
      const onlyIcy = [doodad('floor_a', 'FLOOR', { biomes: [link('icy', 40)] })];
      install(onlyIcy, BIOMES);
      make().sandboxDoodadsRequested = true;
      engine!.resetWorld();
      const field = engine!.biomeField!;
      const placed = standing();
      expect(placed.length).toBeGreaterThan(0);
      const icy = field.biomes.findIndex((b) => b.key === 'icy');
      // (a doodad can stand in the blend at the edge of the band, where the icy share is smaller but not zero)
      for (const p of placed) expect(field.weightsAt(p.x, p.y)[icy]).toBeGreaterThan(0);
      expect(placed.some((p) => field.weightsAt(p.x, p.y)[icy] === 1)).toBe(true);
    });

    it('reads the band at the right row for scenery above the hall too (the sealed gas chambers in the last band)', () => {
      install([doodad('floor_a', 'FLOOR', { width: 1, height: 1, biomes: [link('hot', 60)] })], BIOMES);
      make().sandboxDoodadsRequested = true;
      engine!.resetWorld();
      // Chamber floors are above the hall (ground rows 6-23, the hall starts at row 36); without the shift those rows read as sky, which is the default biome
      expect(standing().some((p) => p.y - engine!.surfaceRow < 12 * S)).toBe(true);
    });

    it('generates nothing without doodads defined, and still builds the map', () => {
      install([], BIOMES);
      make().sandboxDoodadsRequested = true;
      engine!.resetWorld();
      expect(standing()).toEqual([]);
      expect(engine!.grid.length).toBeGreaterThan(0);
    });
  });

  describe('test scenes', () => {
    beforeEach(() => {
      install(DOODADS);
      make();
    });
    const load = (id: string) => tools().loadDoodadScene(cid, id);

    it('lists the scenes for the panel only when the room has doodads', () => {
      expect(DOODAD_SCENE_OPTIONS.map((s) => s.id)).toEqual(DOODAD_SCENES.map((s) => s.id));
      const state = MiningSessionManager.getInstance().buildClientState(engine!, cid);
      expect(state.sandbox?.doodads?.length).toBe(DOODADS.length);
      expect(state.sandbox?.doodadScenes?.map((s) => s.id)).toEqual(DOODAD_SCENES.map((s) => s.id));
      engine!.stop();
      install([]);
      make();
      const empty = MiningSessionManager.getInstance().buildClientState(engine!, cid);
      expect(empty.sandbox?.doodads).toBeUndefined();
      expect(empty.sandbox?.doodadScenes).toBeUndefined();
    });

    it('refuses an unknown scene, and any scene when there are no doodads', () => {
      expect(load('nope')).toEqual({ ok: false, error: 'Unknown scene.' });
      expect(findDoodadScene(undefined)).toBeUndefined();
      engine!.stop();
      install([]);
      make();
      expect(load('floor-row')).toEqual({ ok: false, error: 'There are no doodads defined to show.' });
    });

    it('floor row: every floor kind and size, once, on the hall floor, with the player put before the row', () => {
      const res = load('floor-row');
      expect(res).toMatchObject({ ok: true });
      const placed = standing();
      // floor_a has two sizes, bug_a one
      expect(placed.map((p) => `${keyOf(p.typeIndex)}#${p.variant}`).sort()).toEqual(['bug_a#0', 'floor_a#0', 'floor_a#1']);
      const floorY = engine!.surfaceRow + 16 * S - 1; // the last open row of the hall
      for (const p of placed) {
        const def = engine!.doodadSubsystem.definitions[p.typeIndex];
        expect(doodadRect(def, p).y + doodadRect(def, p).height - 1).toBe(floorY);
      }
      expect((res as { placed: number }).placed).toBe(3);
      expect(engine!.getPlayer(cid)!.playerBody.position.x).toBeLessThan(Math.min(...placed.map((p) => p.x)));
    });

    it('ceiling row, walls, bug field, reaction lane and everything each place the right kinds', () => {
      const kinds = (id: string) => {
        expect(load(id)).toMatchObject({ ok: true });
        return [...new Set(standing().map((p) => keyOf(p.typeIndex)))].sort();
      };
      expect(kinds('ceiling-row')).toEqual(['ceiling_a']);
      expect(kinds('walls')).toEqual(['wall_a']);
      expect(kinds('bug-field')).toEqual(['air_a', 'bug_a']);
      expect(standing().filter((p) => keyOf(p.typeIndex) === 'bug_a')).toHaveLength(4);
      expect(kinds('reaction-lane')).toEqual(['bug_a']);
      expect(kinds('everything')).toEqual(['air_a', 'bug_a', 'ceiling_a', 'floor_a', 'wall_a']);
    });

    it('stacks wall doodads down the left wall and mirrors the ones that spill onto the right wall', () => {
      install([doodad('tall_wall', 'WALL', { width: 1, height: 5 })]);
      engine!.stop();
      make();
      expect(load('walls')).toMatchObject({ ok: true });
      expect(standing().every((p) => p.flip === false)).toBe(true);
    });

    it('clears what was there first, so a scene always starts from the same room', () => {
      load('floor-row');
      const first = standing();
      load('floor-row');
      expect(standing()).toEqual(first);
      load('ceiling-row');
      expect(standing().every((p) => keyOf(p.typeIndex) === 'ceiling_a')).toBe(true);
    });

    it('says what is missing when no doodad of that kind exists, and leaves the room as it was cleared', () => {
      install([doodad('only_floor', 'FLOOR')]);
      engine!.stop();
      make();
      expect(load('ceiling-row')).toEqual({ ok: false, error: 'No ceiling doodads are defined (or none of them fit in the hall).' });
    });

    it('every doodad a scene places fits the way a hand-placed one must', () => {
      for (const scene of DOODAD_SCENES) {
        expect(load(scene.id), scene.id).toMatchObject({ ok: true });
        const defs = engine!.doodadSubsystem.definitions;
        // The kind itself fills its footprint in the grid only in the sense that doodads are background: the cells stay open
        for (const p of standing()) expect(doodadPlacementProblem(engine!.grid, defs[p.typeIndex], p), `${scene.id} ${keyOf(p.typeIndex)}`).toBeNull();
      }
      expect(doodadsInstalled.length).toBe(DOODADS.length);
    });
  });
});
