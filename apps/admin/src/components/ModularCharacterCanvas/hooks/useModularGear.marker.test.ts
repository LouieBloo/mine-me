import { describe, it, expect } from 'vitest';
import { Sprite, Texture } from 'pixi.js';
import { syncParticleMarker, syncLightMarker, PARTICLE_MARKER_LABEL, LIGHT_MARKER_LABEL } from './useModularGear';
import { heldParticleOf } from './useHeldParticlePreview';

const held = { config: { emitterType: 'continuous' } as any, offsetX: 14, offsetY: -22 };

describe('held particle marker', () => {
  it('adds a marker at the offset and moves the same marker afterwards', () => {
    const sprite = new Sprite(Texture.WHITE);

    syncParticleMarker(sprite, held);
    const marker = sprite.getChildByLabel(PARTICLE_MARKER_LABEL)!;
    expect(marker.visible).toBe(true);
    expect([marker.x, marker.y]).toEqual([14, -22]);

    syncParticleMarker(sprite, { ...held, offsetX: 30, offsetY: 5 });
    expect(sprite.children.filter((c) => c.label === PARTICLE_MARKER_LABEL)).toHaveLength(1);
    expect([marker.x, marker.y]).toEqual([30, 5]);
  });

  it('hides the marker when the item has no held effect, and draws none to begin with', () => {
    const sprite = new Sprite(Texture.WHITE);
    syncParticleMarker(sprite, null);
    expect(sprite.getChildByLabel(PARTICLE_MARKER_LABEL)).toBeNull();

    syncParticleMarker(sprite, held);
    syncParticleMarker(sprite, undefined);
    expect(sprite.getChildByLabel(PARTICLE_MARKER_LABEL)!.visible).toBe(false);
  });

  it('reads the held effect from the weapon in a gear list only', () => {
    expect(heldParticleOf(undefined)).toBeNull();
    expect(heldParticleOf([{ url: 'a', subType: 'HEAD', heldParticle: held }])).toBeNull();
    expect(heldParticleOf([{ url: 'a', subType: 'WEAPON' }])).toBeNull();
    expect(heldParticleOf([{ url: 'a', subType: 'WEAPON', heldParticle: held }])).toBe(held);
  });
});

describe('held light marker', () => {
  it('adds a marker at the offset, moves it, and hides it without a light', () => {
    const sprite = new Sprite(Texture.WHITE);
    syncLightMarker(sprite, null);
    expect(sprite.getChildByLabel(LIGHT_MARKER_LABEL)).toBeNull();

    syncLightMarker(sprite, { offsetX: 8, offsetY: -12 });
    const marker = sprite.getChildByLabel(LIGHT_MARKER_LABEL)!;
    expect([marker.visible, marker.x, marker.y]).toEqual([true, 8, -12]);

    syncLightMarker(sprite, { offsetX: 1, offsetY: 2 });
    expect(sprite.children.filter((c) => c.label === LIGHT_MARKER_LABEL)).toHaveLength(1);
    expect([marker.x, marker.y]).toEqual([1, 2]);

    syncLightMarker(sprite, undefined);
    expect(marker.visible).toBe(false);
  });

  it('keeps the light and particle markers separate', () => {
    const sprite = new Sprite(Texture.WHITE);
    syncLightMarker(sprite, { offsetX: 1, offsetY: 1 });
    syncParticleMarker(sprite, { config: {} as any, offsetX: 5, offsetY: 5 });
    expect(sprite.getChildByLabel(LIGHT_MARKER_LABEL)!.x).toBe(1);
    expect(sprite.getChildByLabel(PARTICLE_MARKER_LABEL)!.x).toBe(5);
  });
});
