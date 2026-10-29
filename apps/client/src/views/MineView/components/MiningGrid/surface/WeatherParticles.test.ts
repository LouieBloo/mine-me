import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { FOG_BANDS, MAX_RAIN, MAX_SNOW, MAX_SPLASHES, WeatherParticles } from './WeatherParticles';

const HORIZON = 600;
const view = { left: 100, top: 0, width: 900, height: 700 };
const none = { rainIntensity: 0, snow: 0, fog: 0, wind: 0 };
const make = () => {
  const parent = new Container();
  return { parent, weather: new WeatherParticles(parent, { seed: 3, tileSize: 10 }) };
};
const sprites = (w: WeatherParticles) => (w.root.children as unknown as { visible: boolean; x: number; y: number; alpha: number; rotation: number }[]);
const rainOf = (w: WeatherParticles) => sprites(w).slice(FOG_BANDS, FOG_BANDS + MAX_RAIN);
const snowOf = (w: WeatherParticles) => sprites(w).slice(FOG_BANDS + MAX_RAIN, FOG_BANDS + MAX_RAIN + MAX_SNOW);
const fogOf = (w: WeatherParticles) => sprites(w).slice(0, FOG_BANDS);

describe('WeatherParticles', () => {
  it('is added to its parent, hidden and empty in clear weather', () => {
    const { parent, weather } = make();
    expect(parent.children).toContain(weather.root);
    weather.update(view, HORIZON, none, 1, 1);
    expect(weather.root.visible).toBe(false);
    expect(weather.particleCount).toBe(0);
    expect(weather.objectCount).toBe(MAX_RAIN + MAX_SNOW + MAX_SPLASHES + FOG_BANDS);
  });

  it('rains more heavily with the intensity, up to a hard cap', () => {
    const { weather } = make();
    const count = (rainIntensity: number) => {
      weather.update(view, HORIZON, { ...none, rainIntensity }, 1, 1);
      return rainOf(weather).filter((s) => s.visible).length;
    };
    const light = count(0.2);
    const heavy = count(0.7);
    const full = count(1);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(full).toBeGreaterThanOrEqual(heavy);
    expect(full).toBeLessThanOrEqual(MAX_RAIN);
    weather.update({ ...view, width: 100000 }, HORIZON, { ...none, rainIntensity: 1 }, 1, 2);
    expect(rainOf(weather).filter((s) => s.visible).length).toBeLessThanOrEqual(MAX_RAIN);
  });

  it('keeps every raindrop between the top of the view and the ground, never in the mine', () => {
    const { weather } = make();
    for (const t of [1, 1.3, 2.7, 9.1, 55]) {
      weather.update(view, HORIZON, { ...none, rainIntensity: 1, wind: 0.5 }, 1, t);
      for (const drop of rainOf(weather).filter((s) => s.visible)) {
        expect(drop.y).toBeGreaterThanOrEqual(view.top);
        expect(drop.y).toBeLessThanOrEqual(HORIZON + 1);
      }
    }
  });

  it('stops the snow at the ground too', () => {
    const { weather } = make();
    for (const t of [1, 4, 20, 77]) {
      weather.update(view, HORIZON, { ...none, snow: 1 }, 1, t);
      const flakes = snowOf(weather).filter((s) => s.visible);
      expect(flakes.length).toBeGreaterThan(0);
      for (const flake of flakes) {
        expect(flake.y).toBeGreaterThanOrEqual(view.top);
        expect(flake.y).toBeLessThanOrEqual(HORIZON);
      }
    }
  });

  it('leaves snow and rain behind when the camera moves, instead of carrying it along', () => {
    for (const kind of ['snow', 'rainIntensity'] as const) {
      const { weather } = make();
      const pick = kind === 'snow' ? snowOf : rainOf;
      weather.update(view, HORIZON, { ...none, [kind]: 1 }, 1, 1);
      const before = pick(weather).filter((s) => s.visible).map((s) => s.x);
      // The camera moves 40px right: a flake that is still on screen is 40px further left on the screen
      weather.update({ ...view, left: view.left + 40 }, HORIZON, { ...none, [kind]: 1 }, 1, 1);
      const moved = pick(weather).filter((s) => s.visible).map((s) => s.x);
      const stayed = before.filter((x) => moved.some((m) => Math.abs(m - x) < 0.001));
      // Almost all of them keep their world position (only those that wrapped round the edge changed)
      expect(stayed.length).toBeGreaterThan(before.length * 0.8);
    }
  });

  it('draws nothing at all when the sky is not in view (underground)', () => {
    const { weather } = make();
    weather.update({ ...view, top: HORIZON + 100 }, HORIZON, { ...none, rainIntensity: 1, snow: 1, fog: 1 }, 1, 1);
    expect(weather.root.visible).toBe(false);
    expect(weather.particleCount).toBe(0);
    weather.update({ ...view, top: HORIZON }, HORIZON, { ...none, rainIntensity: 1 }, 1, 2);
    expect(weather.root.visible).toBe(false);
  });

  it('draws nothing once the camera is far enough down that the weather has faded out', () => {
    const { weather } = make();
    weather.update(view, HORIZON, { ...none, rainIntensity: 1 }, 0, 1);
    expect(weather.root.visible).toBe(false);
    weather.update(view, HORIZON, { ...none, rainIntensity: 1 }, 1, 2);
    expect(weather.root.visible).toBe(true);
  });

  it('slants the rain with the wind, and the other way for the other wind', () => {
    const { weather } = make();
    weather.update(view, HORIZON, { ...none, rainIntensity: 1, wind: 0 }, 1, 1);
    expect(rainOf(weather).find((s) => s.visible)!.rotation).toBeCloseTo(0);
    weather.update(view, HORIZON, { ...none, rainIntensity: 1, wind: 1 }, 1, 1);
    const right = rainOf(weather).find((s) => s.visible)!.rotation;
    weather.update(view, HORIZON, { ...none, rainIntensity: 1, wind: -1 }, 1, 1);
    const left = rainOf(weather).find((s) => s.visible)!.rotation;
    expect(right).toBeLessThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it('lands drops as splashes on the ground row', () => {
    const { weather } = make();
    let seen = 0;
    for (let t = 1; t < 6; t += 0.05) {
      weather.update(view, HORIZON, { ...none, rainIntensity: 1 }, 1, t);
      const splashes = sprites(weather).slice(FOG_BANDS + MAX_RAIN + MAX_SNOW).filter((s) => s.visible);
      for (const s of splashes) expect(s.y).toBe(HORIZON);
      seen = Math.max(seen, splashes.length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(MAX_SPLASHES);
  });

  it('lays fog bands along the horizon in proportion to the fog, and none without it', () => {
    const { weather } = make();
    weather.update(view, HORIZON, { ...none, fog: 0.2 }, 1, 1);
    const thin = fogOf(weather).map((b) => b.alpha);
    weather.update(view, HORIZON, { ...none, fog: 0.9 }, 1, 1);
    const thick = fogOf(weather).map((b) => b.alpha);
    expect(fogOf(weather).every((b) => b.visible)).toBe(true);
    expect(thick[0]).toBeGreaterThan(thin[0]);
    for (const band of fogOf(weather)) expect(band.y).toBeLessThan(HORIZON);
    weather.update(view, HORIZON, { ...none, rainIntensity: 1 }, 1, 2);
    expect(fogOf(weather).every((b) => !b.visible)).toBe(true);
  });

  it('counts what is showing, for the profiler', () => {
    const { weather } = make();
    weather.update(view, HORIZON, { ...none, rainIntensity: 1, fog: 1 }, 1, 1);
    expect(weather.particleCount).toBeGreaterThan(FOG_BANDS);
    expect(weather.particleCount).toBeLessThanOrEqual(MAX_RAIN + FOG_BANDS + MAX_SPLASHES);
  });

  it('has no gameplay side effects: it only changes its own sprites', () => {
    const { parent, weather } = make();
    const before = parent.children.length;
    weather.update(view, HORIZON, { ...none, rainIntensity: 1, snow: 1, fog: 1, wind: 1 }, 1, 3);
    expect(parent.children).toHaveLength(before);
  });

  it('can be destroyed', () => {
    const { weather } = make();
    weather.destroy();
    expect(weather.root.destroyed).toBe(true);
  });
});
