import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_FLUID_APPEARANCE, MINING_CONFIG, MiningTileType, quantizeFluidLevel, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';

describe('fluids on the wire', () => {
  afterEach(() => vi.restoreAllMocks());
  const cid = 'wire-char';
  let engine: MiningGameEngine;
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const oilId = () => engine.fluidSubsystem.registry.idOf('OIL')!;
  const oilDefinition = () => engine.fluidSubsystem.clientDefinitions().find((d) => d.typeKey === 'OIL')!;
  const lastTick = () => ticks()[ticks().length - 1];
  const setTile = (x: number, y: number, type: number, revealed = true) => {
    engine.grid[y][x] = { type: type as MiningTileType, revealed };
  };

  /** A pocket x 30..34, y 30..32, solid around it, with the player far away (nothing revealed there). */
  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0, skyRows: 0 }, socket: socket as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Forget the generated oil so only this test's oil exists
    for (let y = 0; y < engine.fluidSubsystem.grid.height; y++) {
      for (let x = 0; x < engine.fluidSubsystem.grid.width; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    }
    engine.fluidSubsystem.drainChanges();
    for (let y = 28; y <= 34; y++) {
      for (let x = 28; x <= 36; x++) {
        const open = x >= 30 && x <= 34 && y >= 30 && y <= 32;
        setTile(x, y, open ? MiningTileType.EMPTY : MiningTileType.DIRT, false);
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 130.5, y: 5.5 };
  });

  it('never sends fluid in cells the fog of war has not revealed', () => {
    engine.fluidSubsystem.placeFluid(32, 30, 'OIL');
    tick(20);
    expect(ticks().every((t) => !t.fluidCells || t.fluidCells.length === 0)).toBe(true);
  });

  it('sends changed cells once they are revealed, as [x, y, fluidId, level]', () => {
    for (let x = 30; x <= 34; x++) engine.grid[30][x].revealed = true;
    engine.fluidSubsystem.placeFluid(32, 30, 'OIL');
    vi.spyOn(engine.fluidSubsystem, 'update').mockImplementation(() => {}); // (the wire format of the placed cell, before it starts to flow)
    tick(1);
    const t = lastTick();
    // The oil has open cells under it, so it is falling (the fifth value)
    expect(t.fluidCells).toEqual([[32, 30, oilId(), quantizeFluidLevel(1), 1]]);
  });

  it('sends nothing on ticks where the fluid did not change', () => {
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 34; x++) engine.grid[y][x].revealed = true;
    engine.fluidSubsystem.placeFluid(32, 32, 'OIL', 0.5);
    tick(60);
    const before = ticks().length;
    tick(10);
    expect(ticks().slice(before).every((t) => t.fluidCells === undefined)).toBe(true);
  });

  it('describes a newly revealed tile together with the fluid in it', () => {
    engine.fluidSubsystem.placeFluid(32, 30, 'OIL', 0.5);
    engine.players.get(cid)!.playerBody.position = { x: 32.5, y: 30.5 };
    (engine as any).revealAndTrackTiles({ x: 32.5, y: 30.5 }, 2);
    tick(1);
    const entry = lastTick().revealedTiles!.find((r) => r.x === 32 && r.y === 30)!;
    expect(entry.fluid).toEqual([oilId(), quantizeFluidLevel(0.5), 1]);
    expect(lastTick().revealedTiles!.find((r) => r.x === 31 && r.y === 30)!.fluid).toBeUndefined();
  });

  it('gives a joining client the fluid definitions and a snapshot of only the revealed cells', () => {
    engine.fluidSubsystem.placeFluid(31, 31, 'OIL', 0.75);
    engine.fluidSubsystem.placeFluid(33, 31, 'OIL', 0.25);
    engine.grid[31][31].revealed = true;
    const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
    expect(state.fluids!.find((f) => f.typeKey === 'OIL')).toMatchObject(
      { id: oilId(), typeKey: 'OIL', name: 'Oil', color: '#0b0b0d', opacity: 0.9, viscosity: 0.6, density: 0.8 },
    );
    expect(state.fluids!.map((f) => f.typeKey).sort()).toEqual(['LAVA', 'OIL', 'WATER']);
    expect(state.fluidCells).toEqual([[31, 31, oilId(), quantizeFluidLevel(0.75), 1]]);
  });

  it('sends how the fluid looks, with whatever the admin left out filled in', () => {
    engine.dataManager.getFluid('OIL')!.appearance = { waveAmplitude: 0.02, highlight: 9 };
    const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
    expect(state.fluids!.find((f) => f.typeKey === 'OIL')!.appearance).toEqual({ ...DEFAULT_FLUID_APPEARANCE, waveAmplitude: 0.02, highlight: 1 });
  });

  it('tells clients which fluid is falling: in tick changes, the join snapshot and newly revealed tiles', () => {
    // A cell of oil in the open air of the pocket, falling
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 34; x++) engine.grid[y][x].revealed = true;
    engine.fluidSubsystem.placeFluid(32, 30, 'OIL', 1);
    tick(MINING_CONFIG.FLUID_STEP_TICKS);
    const fell = ticks().flatMap((t) => t.fluidCells ?? []).find((c) => c[0] === 32 && c[1] === 31);
    expect(fell).toBeDefined();
    expect(fell![4]).toBeGreaterThan(0);
    expect(engine.fluidSubsystem.contentsAt(32, 31)).toHaveLength(3);
    const state = MiningSessionManager.getInstance().buildClientState(engine, cid);
    expect(state.fluidCells!.find((c) => c[0] === 32 && c[1] === 31)![4]).toBeGreaterThan(0);
  });

  it('reports oil that drained away as an empty cell', () => {
    for (let y = 30; y <= 32; y++) for (let x = 30; x <= 34; x++) engine.grid[y][x].revealed = true;
    engine.fluidSubsystem.placeFluid(32, 32, 'OIL', 0.5); // resting on the floor of the pocket
    tick(6);
    for (let x = 30; x <= 34; x++) engine.fluidSubsystem.grid.drainFluid(x, 32, 5); // (the oil has spread along the pocket floor by now: drain all of it)
    tick(6);
    const last = new Map<string, Array<number | undefined>>();
    for (const c of ticks().flatMap((t) => t.fluidCells ?? [])) last.set(`${c[0]},${c[1]}`, c);
    expect(last.get('32,32')).toEqual([32, 32, 0, 0]);
  });

  describe('how a burning fluid looks', () => {
    const FLAME = { emitterType: 'continuous', rate: 30 } as any;
    const LIGHT = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 3, intensity: 0.8 } as any;
    const burns = (extra: object) => ({ ignitionChance: 1, spreadChance: 1, burnDuration: 4, heat: 3, burnsInto: null, ...extra });

    it('carries the flame effect and light the fluid names, resolved from the particle library', () => {
      engine.dataManager.getFluid('OIL')!.flammability = burns({ flameEffectId: 'pe_flame', flameLight: LIGHT });
      vi.spyOn(engine.dataManager, 'getParticleEffect').mockImplementation((id) => (id === 'pe_flame' ? ({ id, config: FLAME } as any) : undefined));
      const oil = oilDefinition();
      expect(oil.flame).toEqual({ effect: FLAME, light: LIGHT });
    });

    it('sends no flame when the fluid names none, or the effect is not in the library', () => {
      engine.dataManager.getFluid('OIL')!.flammability = burns({});
      expect(oilDefinition().flame).toBeUndefined();
      engine.dataManager.getFluid('OIL')!.flammability = burns({ flameEffectId: 'missing' });
      expect(oilDefinition().flame).toBeUndefined();
    });

    it('sends the light alone when only a light is set, and leaves out a disabled one', () => {
      engine.dataManager.getFluid('OIL')!.flammability = burns({ flameLight: LIGHT });
      expect(oilDefinition().flame).toEqual({ effect: null, light: LIGHT });
      engine.dataManager.getFluid('OIL')!.flammability = burns({ flameLight: { ...LIGHT, enabled: false } });
      expect(oilDefinition().flame).toBeUndefined();
    });

    it('carries the fluid\'s always-on glow, and leaves out a disabled or missing one', () => {
      const oil = engine.dataManager.getFluid('OIL')!;
      oil.light = LIGHT;
      expect(oilDefinition().light).toEqual(LIGHT);
      oil.light = { ...LIGHT, enabled: false };
      expect(oilDefinition().light).toBeUndefined();
      oil.light = null;
      expect(oilDefinition().light).toBeUndefined();
    });

    it('carries the fluid\'s playable sounds, and none when it has none', () => {
      expect(oilDefinition().sounds).toBeUndefined();
      const sounds = { enter: { soundId: 's1', url: '/assets/sounds/splash.mp3', volume: 0.5, loop: false } };
      engine.dataManager.getFluid('OIL')!.sounds = sounds;
      expect(oilDefinition().sounds).toEqual(sounds);
      engine.dataManager.getFluid('OIL')!.sounds = {};
      expect(oilDefinition().sounds).toBeUndefined();
    });

    it('a joining client also gets the map\'s default edge look for terrain blocks', () => {
      const look = { radius: 0.2, rimColor: '#222222' };
      engine.mapConfig = { ...engine.mapConfig, autotileStyle: look };
      expect(MiningSessionManager.getInstance().buildClientState(engine, cid).autotileStyle).toEqual(look);
      engine.mapConfig = { ...engine.mapConfig, autotileStyle: null };
      expect(MiningSessionManager.getInstance().buildClientState(engine, cid).autotileStyle).toBeNull();
    });

    it('a joining client also gets the effect drawn on burning bodies, from the map config', () => {
      engine.mapConfig = { ...engine.mapConfig, burningEffectId: 'pe_burning' };
      vi.spyOn(engine.dataManager, 'getParticleEffect').mockImplementation((id) => (id === 'pe_burning' ? ({ id, config: FLAME } as any) : undefined));
      expect(MiningSessionManager.getInstance().buildClientState(engine, cid).burningEffect).toEqual(FLAME);
      engine.mapConfig = { ...engine.mapConfig, burningEffectId: null };
      expect(MiningSessionManager.getInstance().buildClientState(engine, cid).burningEffect).toBeNull();
    });
  });
});
