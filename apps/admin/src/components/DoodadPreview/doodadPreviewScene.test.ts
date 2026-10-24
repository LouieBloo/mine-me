import { describe, it, expect } from 'vitest';
import { evaluateDoodadMotion, type DoodadDefinition } from '@mine-me/shared';
import {
  PREVIEW_PIXEL_SCALE, PREVIEW_TILE, PREVIEW_WALL_THICKNESS, anchorPoint, buildPreviewScene, composePreviewFrame, hasMotion, motionLoopSeconds, placeholderColor, previewLightStrength, previewPhase, previewSize,
} from './doodadPreviewScene';

const doodad = (over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: 'd', key: 'moss', name: 'Moss', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, biomes: [], ...over,
});
const noImages = new Map<string, { width: number; height: number }>();
const frame = (d: DoodadDefinition, extra: Partial<Parameters<typeof composePreviewFrame>[0]> = {}) =>
  composePreviewFrame({ doodad: d, scene: buildPreviewScene(d.anchor, d.width, d.height), variantIndex: 0, timeSeconds: 0, reactionAngle: 0, wander: null, imageSizes: noImages, ...extra });

describe('buildPreviewScene', () => {
  it('puts a floor under a FLOOR doodad, with the doodad standing on it', () => {
    const s = buildPreviewScene('FLOOR', 3, 4);
    expect(s.isSolid(0, s.footprint.y + s.footprint.height)).toBe(true);
    expect(s.isSolid(0, s.footprint.y + s.footprint.height - 1)).toBe(false);
    expect(s.footprint.y + s.footprint.height + PREVIEW_WALL_THICKNESS).toBe(s.rows);
  });

  it('puts a ceiling over a CEILING doodad, with the doodad hanging from it', () => {
    const s = buildPreviewScene('CEILING', 3, 4);
    expect(s.isSolid(5, s.footprint.y - 1)).toBe(true);
    expect(s.isSolid(5, s.footprint.y)).toBe(false);
  });

  it('puts a wall on the left of a WALL doodad, or on the right when flipped', () => {
    const left = buildPreviewScene('WALL', 3, 3);
    expect(left.isSolid(left.footprint.x - 1, left.footprint.y)).toBe(true);
    expect(left.isSolid(left.footprint.x, left.footprint.y)).toBe(false);
    expect(left.flip).toBe(false);
    const right = buildPreviewScene('WALL', 3, 3, true);
    expect(right.flip).toBe(true);
    expect(right.isSolid(right.footprint.x + right.footprint.width, right.footprint.y)).toBe(true);
    expect(right.isSolid(right.footprint.x + right.footprint.width - 1, right.footprint.y)).toBe(false);
  });

  it('only flips a WALL doodad, and leaves an AIR doodad in open air', () => {
    expect(buildPreviewScene('FLOOR', 3, 3, true).flip).toBe(false);
    const air = buildPreviewScene('AIR', 3, 3);
    expect(air.isSolid(air.footprint.x, air.footprint.y)).toBe(false);
  });

  it('counts everything outside the scene as solid, so a bug cannot leave it', () => {
    const s = buildPreviewScene('AIR', 3, 3);
    expect(s.isSolid(-1, 3)).toBe(true);
    expect(s.isSolid(3, s.rows)).toBe(true);
  });

  it('is big enough for a big doodad', () => {
    const s = buildPreviewScene('FLOOR', 30, 20);
    expect(s.cols).toBeGreaterThan(30);
    expect(s.footprint.y).toBeGreaterThanOrEqual(0);
  });
});

describe('previewSize', () => {
  it('uses the doodad\'s own size without variants, and a variant by index (clamped)', () => {
    expect(previewSize(doodad(), 0)).toEqual({ width: 3, height: 3, textureUrl: null });
    const d = doodad({ sizeVariants: [{ width: 3, height: 3, weight: 1 }, { width: 6, height: 9, weight: 1, textureUrl: '/assets/big.png' }] });
    expect(previewSize(d, 1)).toEqual({ width: 6, height: 9, textureUrl: '/assets/big.png' });
    expect(previewSize(d, 9).width).toBe(6);
    expect(previewSize(d, -3).width).toBe(3);
  });
});

describe('composePreviewFrame', () => {
  it('draws a placeholder in the footprint box while there is no picture', () => {
    const f = frame(doodad());
    expect(f.pieces).toHaveLength(1);
    expect(f.pieces[0].url).toBeNull();
    expect(f.pieces[0].width).toBe(3 * PREVIEW_TILE);
    expect(f.pieces[0].pivotX).toBe(0.5);
    expect(f.pieces[0].pivotY).toBe(1); // a floor doodad turns about its base
  });

  it('draws the picture once its size is known, fitted into the footprint with its aspect kept', () => {
    const d = doodad({ textureUrl: '/assets/m.png' });
    const f = frame(d, { imageSizes: new Map([['/assets/m.png', { width: 20, height: 40 }]]) });
    expect(f.pieces[0].url).toBe('/assets/m.png');
    expect(f.pieces[0].height).toBe(3 * PREVIEW_TILE);
    expect(f.pieces[0].width).toBeCloseTo(1.5 * PREVIEW_TILE);
  });

  it('poses the picture with the motion preset, the shared one the game uses', () => {
    const d = doodad({ motion: { preset: 'sway' } });
    const scene = buildPreviewScene('FLOOR', 3, 3);
    const f = frame(d, { scene, timeSeconds: 0.7 });
    expect(f.pieces[0].rotation).toBeCloseTo(evaluateDoodadMotion(d.motion, 0.7, previewPhase(scene)).rotation);
    expect(f.pieces[0].rotation).not.toBe(0);
  });

  it('adds the reaction lean to the motion', () => {
    const f = frame(doodad(), { reactionAngle: 0.3 });
    expect(f.pieces[0].rotation).toBeCloseTo(0.3);
  });

  it('mirrors a wall doodad whose wall is on the right', () => {
    const d = doodad({ anchor: 'WALL' });
    const f = frame(d, { scene: buildPreviewScene('WALL', 3, 3, true) });
    expect(f.layout.mirror).toBe(-1);
    expect(f.pieces[0].scaleX).toBe(-1);
  });

  it('draws parts in layer order, each posed on its own, and keeps a part planted with weight 0', () => {
    const part = (name: string, z: number) => ({ name, file: `/assets/${name}.png`, width: 10, height: 10, pivot_anchor: [5, 10] as [number, number], offset_from_anchor: [0, 0] as [number, number], z_index: z });
    const d = doodad({ parts: [part('cap', 2), part('stem', 1)], motion: { preset: 'sway', params: { weight_stem: 0 } } });
    const sizes = new Map([['/assets/cap.png', { width: 10, height: 10 }]]);
    const f = frame(d, { timeSeconds: 0.7, imageSizes: sizes });
    expect(f.pieces.map((p) => p.name)).toEqual(['stem', 'cap']);
    expect(f.pieces[0].rotation).toBe(0);
    expect(f.pieces[1].rotation).not.toBe(0);
    // A part whose picture has not loaded is a placeholder, the one that has is drawn
    expect(f.pieces[0].url).toBeNull();
    expect(f.pieces[1].url).toBe('/assets/cap.png');
  });

  it('carries a wandering bug to where it has walked and faces it the way it goes', () => {
    const still = frame(doodad());
    const moved = frame(doodad(), { wander: { x: 2, y: 0, facing: -1 } });
    expect(moved.anchor.x - still.anchor.x).toBe(2 * PREVIEW_TILE);
    expect(moved.pieces[0].scaleX).toBe(-1);
    expect(moved.lightAt.x - still.lightAt.x).toBe(2 * PREVIEW_TILE);
  });

  it('places the light and the particles at their offsets, scaled from the game\'s pixels', () => {
    const d = doodad({
      light: { enabled: true, type: 'POINT', effect: 'STATIC', color: '#ffffff', radius: 6, intensity: 0.5, offsetX: 10, offsetY: -20 },
      particleOffsetX: -5,
      particleOffsetY: 7,
    });
    const f = frame(d);
    expect(f.lightAt).toEqual({ x: f.anchor.x + 10 * PREVIEW_PIXEL_SCALE, y: f.anchor.y - 20 * PREVIEW_PIXEL_SCALE });
    expect(f.particlesAt).toEqual({ x: f.anchor.x - 5 * PREVIEW_PIXEL_SCALE, y: f.anchor.y + 7 * PREVIEW_PIXEL_SCALE });
    expect(f.light).toEqual({ color: '#ffffff', radius: 6 * PREVIEW_TILE, strength: 0.5 });
  });

  it('has no light when it is off, and a pulse motion makes a steady light pulse', () => {
    expect(frame(doodad({ light: { enabled: false, type: 'POINT', effect: 'STATIC', color: '#fff', radius: 5, intensity: 0.5 } })).light).toBeNull();
    const d = doodad({ motion: { preset: 'pulse' }, light: { enabled: true, type: 'POINT', effect: 'STATIC', color: '#fff', radius: 5, intensity: 0.5, minIntensity: 0.2, maxIntensity: 0.8, pulseSpeed: 1 } });
    const strengths = [0, 0.4, 0.8, 1.2, 1.6].map((t) => frame(d, { timeSeconds: t }).light!.strength);
    expect(new Set(strengths.map((s) => s.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('shows a falling drop only while a drip\'s drop is falling', () => {
    const d = doodad({ anchor: 'CEILING', motion: { preset: 'drip' } });
    const scene = buildPreviewScene('CEILING', 3, 3);
    const drops = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2].map((t) => frame(d, { scene, timeSeconds: t }).drop);
    expect(drops.some((x) => x === null)).toBe(true);
    const falling = drops.find((x) => x !== null)!;
    expect(falling.alpha).toBeLessThanOrEqual(1);
    expect(frame(doodad(), { scene }).drop).toBeNull();
  });
});

describe('previewLightStrength', () => {
  it('is the intensity for a steady light and stays within 0 and 1', () => {
    expect(previewLightStrength({ effect: 'STATIC', intensity: 0.4 }, 5)).toBe(0.4);
    expect(previewLightStrength({ effect: 'STATIC', intensity: 3 }, 5)).toBe(1);
  });
  it('swings between the pulse minimum and maximum', () => {
    const light = { effect: 'PULSE', intensity: 0.5, minIntensity: 0.2, maxIntensity: 0.8, pulseSpeed: 2 };
    const values = Array.from({ length: 100 }, (_, i) => previewLightStrength(light, i * 0.05));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(Math.max(...values)).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
  });
  it('flickers around the intensity', () => {
    const light = { effect: 'FLICKER', intensity: 0.5, flickerAmount: 0.4, flickerSpeed: 10 };
    const values = Array.from({ length: 100 }, (_, i) => previewLightStrength(light, i * 0.05));
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(10);
  });
});

describe('small helpers', () => {
  it('gives a placeholder the same colour for the same key, and different keys different colours', () => {
    expect(placeholderColor('moss')).toBe(placeholderColor('moss'));
    expect(placeholderColor('moss')).not.toBe(placeholderColor('glow_mushroom'));
  });

  it('knows when a doodad moves and how long a loop takes', () => {
    expect(hasMotion(doodad())).toBe(false);
    expect(hasMotion(doodad({ motion: { preset: 'nonsense' } }))).toBe(false);
    expect(motionLoopSeconds(doodad())).toBe(0);
    expect(motionLoopSeconds(doodad({ motion: { preset: 'sway', speed: 0.5 } }))).toBeCloseTo(2);
  });

  it('marks the anchor point on the anchored edge', () => {
    const floor = buildPreviewScene('FLOOR', 3, 3);
    const p = anchorPoint(floor, 'FLOOR');
    expect(p.x).toBe((floor.footprint.x + 1.5) * PREVIEW_TILE);
    expect(p.y).toBe((floor.footprint.y + 3) * PREVIEW_TILE);
    const right = buildPreviewScene('WALL', 3, 3, true);
    expect(anchorPoint(right, 'WALL').x).toBe((right.footprint.x + 3) * PREVIEW_TILE);
  });
});
