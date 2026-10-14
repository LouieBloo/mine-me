import { useEffect, useRef } from 'react';
import { Container, type Application, type Sprite } from 'pixi.js';
import { ParticleEngine } from '../../ParticleCanvas/ParticleEngine';
import { HeldParticleEmitter } from './heldParticleEmitter';
import type { HeldParticlePreview, ModularGearItem } from './useModularGear';

export interface UseHeldParticlePreviewOptions {
  appRef: React.RefObject<Application | null>;
  gearSpritesRef: React.RefObject<Map<string, Sprite[]>>;
  selectedGear?: ModularGearItem[];
  isSceneReady?: boolean;
}

/** The held-particle spec of the equipped weapon in a gear list, if any. */
export function heldParticleOf(selectedGear?: ModularGearItem[]): HeldParticlePreview | null {
  return selectedGear?.find((g) => g.subType === 'WEAPON')?.heldParticle ?? null;
}

/**
 * Plays the held item's particle effect in the hold preview, from the marker position on the weapon
 * sprite, so the owner sees the effect follow the swing while tuning its origin.
 */
export function useHeldParticlePreview({ appRef, gearSpritesRef, selectedGear, isSceneReady }: UseHeldParticlePreviewOptions) {
  const heldRef = useRef<HeldParticlePreview | null>(null);
  heldRef.current = heldParticleOf(selectedGear);
  // Only canvases showing an item with a held effect pay for a particle layer
  const hasHeldParticle = heldRef.current !== null;

  useEffect(() => {
    const app = appRef.current;
    if (!isSceneReady || !hasHeldParticle || !app?.stage) return;

    const layer = new Container();
    app.stage.addChild(layer);
    const engine = new ParticleEngine(layer, app.renderer, 1500);
    const emitter = new HeldParticleEmitter();

    const tick = (ticker: { deltaTime?: number }) => {
      const held = heldRef.current;
      const weapon = gearSpritesRef.current?.get('WEAPON')?.[0];
      let position: { x: number; y: number } | null = null;
      if (held && weapon && !weapon.destroyed && weapon.parent) {
        position = layer.toLocal(weapon.toGlobal({ x: held.offsetX, y: held.offsetY }));
      }
      emitter.sync(engine, held?.config ?? null, position);
      engine.update((ticker.deltaTime || 1) / 60);
    };
    app.ticker.add(tick);

    return () => {
      app.ticker.remove(tick);
      emitter.clear();
      engine.destroy();
      layer.destroy({ children: true });
    };
  }, [appRef, gearSpritesRef, isSceneReady, hasHeldParticle]);
}
