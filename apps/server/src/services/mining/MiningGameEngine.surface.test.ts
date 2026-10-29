import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WEATHER_TYPES, pickSurfaceEnvironment, weatherAt, type MiningStateTickPayload } from '@mine-me/shared';
import { MiningDataManager } from './subsystems/MiningDataManager';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningSessionManager } from './MiningSessionManager';
import { SURFACE_SCENES } from './sandbox/surfaceScenes';

const make = (gameMode: 'sandbox' | 'singleplayer', seed = 21) => {
  const socket = { connected: true, emit: vi.fn() };
  const engine = new MiningGameEngine({ characterId: 'surf', cityId: 'c', seed, gameMode, mapConfig: { mobSpawnCount: 0 }, socket: socket as any });
  const ticks = (): MiningStateTickPayload[] => socket.emit.mock.calls.filter((c) => c[0] === 'mining_state_tick').map((c) => c[1]);
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  return { engine, socket, ticks, tick };
};

describe('the surface of a mining room (tickets 129, 132)', () => {
  it('tells the client the sky once with the session: environment, seed, clock start and server time', () => {
    const { engine } = make('singleplayer');
    const state = MiningSessionManager.getInstance().buildClientState(engine, 'surf');
    // (the environment is the one the shared pick gives this seed from the loaded environments)
    const expected = pickSurfaceEnvironment(21, MiningDataManager.getInstance().getSurfaceEnvironments());
    expect(state.surface).toMatchObject({ seed: 21, environment: { key: expected.key }, override: null });
    expect(state.surface!.startedAt).toBe(engine.surface.startedAt);
    expect(Math.abs(state.surface!.serverNow - Date.now())).toBeLessThan(2000);
  });

  it('lets the client work out the weather itself, so the same seed and clock give the server\'s weather', () => {
    const { engine } = make('singleplayer');
    const state = MiningSessionManager.getInstance().buildClientState(engine, 'surf').surface!;
    const clock = (state.serverNow - state.startedAt) / 1000;
    expect(weatherAt(state.seed, state.environment, clock, state.override)).toEqual(engine.surface.weatherNow(state.serverNow));
  });

  it('sends nothing about the surface in a quiet tick', () => {
    const { ticks, tick } = make('singleplayer');
    tick(5);
    expect(ticks().length).toBeGreaterThan(0);
    expect(ticks().every((t) => t.surface === undefined)).toBe(true);
  });

  it('has no surface tools outside the sandbox', () => {
    expect(make('singleplayer').engine.sandbox).toBeNull();
  });
});

describe('the surface tools of the sandbox (ticket 138)', () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make('sandbox');
  });
  const tools = () => ctx.engine.sandbox!;

  it('forces a weather, tells the room in the next tick once, and shows it in the status', () => {
    expect(tools().setWeather('storm', 0.8)).toEqual({ ok: true });
    expect(tools().status('surf').forcedWeather).toBe('storm');
    ctx.tick(2);
    const updates = ctx.ticks().filter((t) => t.surface);
    expect(updates).toHaveLength(1);
    expect(updates[0].surface!.override).toMatchObject({ weather: 'storm', intensity: 0.8 });
    expect(ctx.engine.surface.weatherNow().rainIntensity).toBeCloseTo(0.8);
  });

  it('puts the forced weather in the state a late joiner gets', () => {
    tools().setWeather('snow', undefined);
    const state = MiningSessionManager.getInstance().buildClientState(ctx.engine, 'surf');
    expect(state.surface!.override).toMatchObject({ weather: 'snow' });
  });

  it('refuses an unknown weather or a bad strength, and changes nothing', () => {
    expect(tools().setWeather('hail', 1)).toEqual({ ok: false, error: 'Unknown weather.' });
    expect(tools().setWeather('rain', 2)).toEqual({ ok: false, error: 'Intensity must be from 0 to 1.' });
    expect(tools().setWeather('rain', 'lots')).toEqual({ ok: false, error: 'Intensity must be from 0 to 1.' });
    expect(tools().status('surf').forcedWeather).toBeNull();
    ctx.tick(1);
    expect(ctx.ticks().every((t) => !t.surface)).toBe(true);
  });

  it('goes back to the seeded weather with a null weather', () => {
    tools().setWeather('fog', 1);
    expect(tools().setWeather(null, undefined)).toEqual({ ok: true });
    expect(tools().status('surf').forcedWeather).toBeNull();
  });

  it('calls a lightning strike for now', () => {
    expect(tools().triggerLightning()).toEqual({ ok: true });
    ctx.tick(1);
    const update = ctx.ticks().find((t) => t.surface)!.surface!;
    expect(update.override?.strikeAt).toBeGreaterThan(0);
  });

  it('loads each named scene, and refuses an unknown one', () => {
    for (const scene of SURFACE_SCENES) {
      expect(tools().loadSurfaceScene(scene.id)).toEqual({ ok: true });
      expect(tools().status('surf').forcedWeather).toBe(scene.weather);
    }
    expect(tools().loadSurfaceScene('nope')).toEqual({ ok: false, error: 'Unknown scene.' });
  });

  it('has a storm scene that flashes, and a heavy-rain scene that does not', () => {
    tools().loadSurfaceScene('storm');
    expect(ctx.engine.surface.weatherNow().lightning).toBe(1);
    tools().loadSurfaceScene('heavy-rain');
    expect(ctx.engine.surface.weatherNow().lightning).toBe(0);
    expect(ctx.engine.surface.weatherNow().rainIntensity).toBe(WEATHER_TYPES.rain.rain);
  });

  it('starts on the default environment, so a problem can be reproduced from the same sky', () => {
    const all = MiningDataManager.getInstance().getSurfaceEnvironments();
    const expected = all.find((e) => e.isDefault)?.key ?? pickSurfaceEnvironment(21, all).key;
    expect(ctx.engine.surface.environment.key).toBe(expected);
    expect(tools().status('surf').surfaceEnvironment).toBe(expected);
  });

  it('refuses to swap to an environment that does not exist', () => {
    expect(tools().setSurfaceEnvironment('nope')).toEqual({ ok: false, error: 'Unknown surface environment.' });
    expect(tools().setSurfaceEnvironment(42)).toEqual({ ok: false, error: 'Unknown surface environment.' });
  });

  it('lists the loaded environments for the panel, and swaps to one of them for the whole room', () => {
    const all = MiningDataManager.getInstance().getSurfaceEnvironments();
    expect(tools().surfaceEnvironmentOptions()).toEqual(all.length > 0 ? all.map((e) => ({ id: e.key, name: e.name })) : undefined);
    if (all.length < 2) return;
    const other = all.find((e) => e.key !== ctx.engine.surface.environment.key)!;
    expect(tools().setSurfaceEnvironment(other.key)).toEqual({ ok: true });
    ctx.tick(1);
    expect(ctx.ticks().find((t) => t.surface)!.surface!.environment?.key).toBe(other.key);
  });

  it('clears what was forced when the sandbox is reset', () => {
    tools().setWeather('storm', 1);
    tools().reset();
    expect(ctx.engine.surface.forcedWeather).toBeNull();
  });
});
