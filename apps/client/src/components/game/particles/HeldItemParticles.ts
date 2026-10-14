import type { Container } from 'pixi.js';
import type { ParticleEffectConfig } from '@mine-me/shared';
import type { ParticleEngine, EmitterHandle } from './ParticleEngine';
import type { HeldParticleSpec } from '../sprites/ModularCharacterSprite';

/** The part of a character sprite the held-item emitter needs. */
export interface HeldParticleSource {
  getHeldParticle(): HeldParticleSpec | null;
  getHeldParticleWorldPosition(relativeToContainer: Container): { x: number; y: number } | null;
}

export type ParticleConfigResolver = (effectId: string) => ParticleEffectConfig | null;

/**
 * Keeps one particle emitter on the item a character is holding.
 *
 * Call `sync` every frame: it creates the emitter when the held item has an effect, moves it with the
 * item (swing, aim, flip), swaps it when the effect changes, and removes it when the item is
 * unequipped. The effect itself is data (an item's held particle effect), never hard-coded here.
 */
export class HeldItemParticles {
  private resolveConfig: ParticleConfigResolver;
  private engine: ParticleEngine | null = null;
  private emitter: EmitterHandle | null = null;
  private effectId: string | null = null;

  constructor(resolveConfig: ParticleConfigResolver) {
    this.resolveConfig = resolveConfig;
  }

  public hasEmitter(): boolean {
    return this.emitter !== null;
  }

  public sync(engine: ParticleEngine | null | undefined, source: HeldParticleSource, space: Container): void {
    if (!engine) {
      this.clear();
      return;
    }
    if (this.engine !== engine) {
      this.clear();
      this.engine = engine;
    }

    const spec = source.getHeldParticle();
    if (!spec) {
      this.clear();
      return;
    }
    const position = source.getHeldParticleWorldPosition(space);
    if (!position) {
      this.clear();
      return;
    }

    if (this.emitter && this.effectId !== spec.effectId) this.clear();

    if (!this.emitter) {
      const config = this.resolveConfig(spec.effectId);
      // Unknown effect (not loaded yet): try again next frame rather than caching the miss
      if (!config) return;
      this.emitter = engine.addEmitter(config, position);
      this.effectId = spec.effectId;
      return;
    }
    this.emitter.setPosition(position);
  }

  /** Stops emitting and forgets the emitter. */
  public clear(): void {
    this.emitter?.destroy();
    this.emitter = null;
    this.effectId = null;
  }

  public destroy(): void {
    this.clear();
    this.engine = null;
  }
}
