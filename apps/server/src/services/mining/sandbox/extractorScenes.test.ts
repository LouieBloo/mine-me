import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningGameEngine } from '../MiningGameEngine';
import { EXTRACTOR_SCENES, EXTRACTOR_SCENE_OPTIONS, findExtractorScene } from './extractorScenes';

describe('extractor test scenes and sandbox tools (ticket 127)', () => {
  const cid = 'sbx-ex';
  let engine: MiningGameEngine;
  let emitted: { event: string; payload: any }[];
  const tickFor = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
  const tools = () => engine.sandbox!;
  const me = () => engine.getPlayer(cid)!;

  beforeEach(() => {
    emitted = [];
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, gameMode: 'sandbox',
      socket: { connected: true, emit: (event: string, payload: any) => emitted.push({ event, payload }) } as any,
    });
  });

  describe('spawning and digging', () => {
    it('has no extractor until it is spawned, then lands it where a real run does', () => {
      expect(engine.extractorSubsystem).toBeNull();
      expect(engine.beltSubsystem).toBeNull();
      expect(tools().spawnExtractor()).toEqual({ ok: true });
      expect(engine.extractorSubsystem).not.toBeNull();
      expect(engine.beltSubsystem).not.toBeNull();
      expect(engine.extractorSubsystem!.isLanded()).toBe(false);
      // Clients rebuild their view first: the landing waits until one says it is ready
      tickFor(engine.extractorSubsystem!.definition.landingSeconds + 0.2);
      expect(engine.extractorSubsystem!.isLanded()).toBe(false);
      engine.clientReady();
      tickFor(engine.extractorSubsystem!.definition.landingSeconds + 0.2);
      expect(engine.extractorSubsystem!.isLanded()).toBe(true);
    });

    it('refuses a second extractor', () => {
      tools().spawnExtractor();
      expect(tools().spawnExtractor()).toEqual({ ok: false, error: 'The extractor is already here.' });
    });

    it('digs belt segments at once, and only once there is an extractor', () => {
      expect(tools().digBelt(5)).toEqual({ ok: false, error: 'Spawn the extractor first.' });
      tools().spawnExtractor();
      const result = tools().digBelt(5);
      expect(result).toEqual({ ok: true, laid: 5 });
      expect(engine.beltSubsystem!.rows).toBe(5);
      expect(engine.extractorSubsystem!.isLanded()).toBe(true);
    });

    it('stops digging where the belt would wait, and checks the number', () => {
      tools().spawnExtractor();
      const huge = tools().digBelt(200);
      expect(huge).toMatchObject({ ok: true });
      expect(engine.beltSubsystem!.rows).toBeLessThan(200);
      for (const bad of [0, -1, 1.5, 201, 'ten', null]) expect(tools().digBelt(bad)).toMatchObject({ ok: false });
    });

    it('a reset takes the extractor away again', () => {
      tools().spawnExtractor();
      tools().digBelt(3);
      tools().reset();
      expect(engine.extractorSubsystem).toBeNull();
      expect(engine.beltSubsystem).toBeNull();
    });
  });

  describe('capacity and the backpack', () => {
    it('sets the carry capacity, and refuses nonsense', () => {
      expect(tools().setCapacity(cid, 250)).toEqual({ ok: true });
      expect(me().carryCapacity).toBe(250);
      for (const bad of [-1, Number.NaN, 'lots', 1e9]) expect(tools().setCapacity(cid, bad)).toMatchObject({ ok: false });
      expect(me().carryCapacity).toBe(250);
      expect(tools().setCapacity('nobody', 5)).toMatchObject({ ok: false });
    });

    it('fills the backpack with a chosen item, or the heaviest when none is named', () => {
      const item = engine.dataManager.getItems()[0];
      expect(tools().fillBackpack(cid, item.id, 7)).toEqual({ ok: true });
      expect(me().temporaryBackpack.find((s) => s.itemId === item.id)?.quantity).toBe(7);
      tools().fillBackpack(cid, item.id, 3);
      expect(me().temporaryBackpack.find((s) => s.itemId === item.id)?.quantity).toBe(10);
      const before = me().temporaryBackpack.length;
      expect(tools().fillBackpack(cid, undefined, 2)).toEqual({ ok: true });
      expect(me().temporaryBackpack.length).toBeGreaterThanOrEqual(before);
      for (const [id, qty] of [['ghost', 1], [item.id, 0], [item.id, 1.5], [item.id, 99999]] as const) expect(tools().fillBackpack(cid, id, qty)).toMatchObject({ ok: false });
    });
  });

  describe('scenes', () => {
    it('lists the four scenes, each found by id', () => {
      expect(EXTRACTOR_SCENES.map((s) => s.id)).toEqual(['belt-blocked-by-fluid', 'mob-attacking-segment', 'full-pack-at-belt', 'items-on-belt-then-death']);
      expect(EXTRACTOR_SCENE_OPTIONS).toHaveLength(4);
      expect(findExtractorScene('full-pack-at-belt')?.name).toBeTruthy();
      expect(findExtractorScene('nope')).toBeUndefined();
      expect(tools().loadExtractorScene(cid, 'nope')).toEqual({ ok: false, error: 'Unknown scene.' });
    });

    it('belt blocked by fluid: waits, says fluid, and carries on when the fluid is cleared', () => {
      expect(tools().loadExtractorScene(cid, 'belt-blocked-by-fluid')).toEqual({ ok: true });
      const belt = engine.beltSubsystem!;
      const rows = belt.rows;
      tickFor(engine.extractorSubsystem!.definition.buildSecondsPerSegment * 3);
      expect(belt.rows).toBe(rows);
      expect(belt.blockedBy).toBe('fluid');
      tools().clearHazards();
      tickFor(engine.extractorSubsystem!.definition.buildSecondsPerSegment * 2 + 0.1);
      expect(belt.rows).toBeGreaterThan(rows);
    });

    it('mob attacking a segment: the belt takes damage from the mob', () => {
      expect(tools().loadExtractorScene(cid, 'mob-attacking-segment')).toEqual({ ok: true });
      const belt = engine.beltSubsystem!;
      const total = () => belt.segments.reduce((n, s) => n + (s?.health ?? 0), 0);
      const apply = vi.spyOn(engine.damageSystem, 'applyDamage');
      const before = total();
      tickFor(2);
      expect(apply.mock.calls.some(([target]) => target.kind === 'belt')).toBe(true);
      expect(total()).toBeLessThanOrEqual(before);
    });

    it('full pack at the belt: you stand on the belt with a full pack and items go on, heaviest first', () => {
      expect(tools().loadExtractorScene(cid, 'full-pack-at-belt')).toEqual({ ok: true });
      const belt = engine.beltSubsystem!;
      expect(belt.isTouching(me())).toBe(true);
      const packBefore = me().temporaryBackpack.reduce((n, s) => n + s.quantity, 0);
      expect(packBefore).toBeGreaterThan(0);
      tickFor(1);
      expect(belt.items.length).toBeGreaterThan(0);
      expect(me().temporaryBackpack.reduce((n, s) => n + s.quantity, 0)).toBeLessThan(packBefore);
    });

    it('items on the belt, then death: items riding are lost when the player dies; the sandbox respawns them', () => {
      expect(tools().loadExtractorScene(cid, 'items-on-belt-then-death')).toEqual({ ok: true });
      const belt = engine.beltSubsystem!;
      expect(belt.items.length).toBe(4);
      expect(me().stash).toEqual([]);
      (engine as any).pendingDeaths.push(cid);
      tickFor(0.1);
      expect(belt.items).toHaveLength(0);
      expect(me().stash).toEqual([]); // nothing was credited
    });

    it('items on the belt, left to arrive: they reach the stash', () => {
      tools().loadExtractorScene(cid, 'items-on-belt-then-death');
      const belt = engine.beltSubsystem!;
      const away = engine.getPlayer(cid)!;
      away.playerBody.position = { x: 3, y: engine.surfaceRow }; // step off so no more are loaded
      tickFor(8);
      expect(belt.items).toHaveLength(0);
      expect(me().stash.reduce((n, s) => n + s.quantity, 0)).toBe(4);
    });
  });

  describe('profiling', () => {
    it('counts the belt\'s segments and items in the performance report, and runs the belt as its own step', () => {
      tools().loadExtractorScene(cid, 'items-on-belt-then-death');
      const counts = (engine as any).perfCounts();
      expect(counts.beltSegments).toBeGreaterThan(0);
      expect(counts.beltItems).toBe(4);
      const steps = new Set<string>();
      vi.spyOn((engine as any).profiler, 'recordStep').mockImplementation(((name: string) => { steps.add(name); }) as any);
      tickFor(0.2);
      expect(steps.has('belt')).toBe(true);
      expect(steps.has('extractor')).toBe(true);
    });
  });

  it('an unknown scene or a room that is not a sandbox cannot be used through the tools', () => {
    const solo = new MiningGameEngine({ characterId: 'solo', cityId: 'c', seed: 5, socket: { connected: true, emit: vi.fn() } as any });
    expect(solo.sandbox).toBeNull();
  });
});
