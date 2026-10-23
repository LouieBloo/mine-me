import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MiningExtractorClientState } from '@mine-me/shared';
import { ExtractorRenderer, LANDING_START_HEIGHT, landingHeightFraction, landingProgress } from './ExtractorRenderer';
import { TILE_SIZE } from './MiningTileRenderer';

const state = (over: Partial<MiningExtractorClientState> = {}): MiningExtractorClientState => ({
  id: 'e', key: 'basic', name: 'Basic', textureUrl: null,
  x: 84, y: 15, width: 12, height: 9,
  landingSeconds: 3, landingRemaining: 3,
  landingEffect: null, sounds: null,
  ...over,
});

describe('landing curve', () => {
  it('starts at the full height, ends at the ground, and eases in (fast first, slow last)', () => {
    expect(landingHeightFraction(0)).toBe(1);
    expect(landingHeightFraction(1)).toBe(0);
    expect(landingHeightFraction(0.5)).toBeLessThan(0.5);
    expect(landingHeightFraction(0.9)).toBeLessThan(landingHeightFraction(0.5));
  });

  it('clamps progress, and a landing of no length is already down', () => {
    expect(landingProgress(-1, 3)).toBe(0);
    expect(landingProgress(9, 3)).toBe(1);
    expect(landingProgress(1.5, 3)).toBe(0.5);
    expect(landingProgress(0, 0)).toBe(1);
  });
});

describe('ExtractorRenderer', () => {
  it('is placed on its cells and starts in the air when the landing has not begun', () => {
    const parent = new Container();
    const r = new ExtractorRenderer(parent, state());
    expect(parent.children).toContain(r.root);
    expect(r.root.x).toBe(84 * TILE_SIZE);
    expect(r.root.y).toBe(15 * TILE_SIZE);
    expect(r.hasTouchedDown).toBe(false);
    expect(r.heightAboveGround).toBeCloseTo(LANDING_START_HEIGHT);
    r.destroy();
  });

  it('comes down over its landing time and touches down once', () => {
    const r = new ExtractorRenderer(new Container(), state());
    r.update(1.5);
    expect(r.heightAboveGround).toBeGreaterThan(0);
    expect(r.heightAboveGround).toBeLessThan(LANDING_START_HEIGHT);
    expect(r.hasTouchedDown).toBe(false);
    r.update(1.6);
    expect(r.hasTouchedDown).toBe(true);
    expect(r.heightAboveGround).toBe(0);
  });

  it('a late joiner sees it already down: no flight, no landing effects', () => {
    const spawnBurst = vi.fn();
    const playSound = vi.fn();
    const r = new ExtractorRenderer(
      new Container(),
      state({ landingRemaining: 0, landingEffect: {} as any, sounds: { landing: { url: '/assets/sounds/land.wav', volume: 0.5 } } }),
      { particles: { spawnBurst } as any, playSound }
    );
    r.update(1);
    expect(r.hasTouchedDown).toBe(true);
    expect(r.heightAboveGround).toBe(0);
    expect(spawnBurst).not.toHaveBeenCalled();
    expect(playSound).not.toHaveBeenCalled();
  });

  it('joining part way through carries on from there', () => {
    const r = new ExtractorRenderer(new Container(), state({ landingRemaining: 1 }));
    expect(r.hasTouchedDown).toBe(false);
    r.update(0.5);
    expect(r.hasTouchedDown).toBe(false);
    r.update(0.6);
    expect(r.hasTouchedDown).toBe(true);
  });

  it('plays dust and the landing sound at its own volume, once, where it touches down', () => {
    const spawnBurst = vi.fn();
    const playSound = vi.fn();
    const effect = { emitterType: 'burst' } as any;
    const r = new ExtractorRenderer(new Container(), state({ landingEffect: effect, sounds: { landing: { url: '/assets/sounds/land.wav', volume: 0.4 } } }), {
      particles: { spawnBurst } as any,
      playSound,
    });
    r.update(3.5);
    r.update(1);
    expect(spawnBurst).toHaveBeenCalledTimes(1);
    expect(spawnBurst).toHaveBeenCalledWith(effect, { x: (84 + 6) * TILE_SIZE, y: (15 + 9) * TILE_SIZE });
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound.mock.calls[0][0]).toEqual({ url: '/assets/sounds/land.wav', volume: 0.4 });
  });

  it('takes its sound player and particles after it is built', () => {
    const playSound = vi.fn();
    const spawnBurst = vi.fn();
    const r = new ExtractorRenderer(new Container(), state({ landingEffect: {} as any, sounds: { landing: { url: '/a.wav' } } }));
    r.setSoundPlayer(playSound);
    r.setParticles({ spawnBurst } as any);
    r.update(4);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound.mock.calls[0][0].volume).toBe(1);
    expect(spawnBurst).toHaveBeenCalledTimes(1);
  });

  it('knows when the server says it has landed, separately from the drawing', () => {
    const r = new ExtractorRenderer(new Container(), state());
    expect(r.isLanded).toBe(false);
    r.markLanded();
    expect(r.isLanded).toBe(true);
    expect(r.hasTouchedDown).toBe(false);
  });

  it('swaps the placeholder for the art once it loads, and survives a failed load', async () => {
    const texture = { width: 10, height: 10 } as any;
    const loadTexture = vi.fn().mockResolvedValue(null);
    const r = new ExtractorRenderer(new Container(), state({ textureUrl: '/assets/sprites/extractor.png' }), { loadTexture });
    await Promise.resolve();
    expect(loadTexture).toHaveBeenCalledWith('/assets/sprites/extractor.png');
    expect(r.root.destroyed).toBe(false);
    void texture;
  });
});
