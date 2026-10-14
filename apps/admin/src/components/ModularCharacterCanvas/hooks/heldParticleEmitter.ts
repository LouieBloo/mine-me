import type { ParticleEffectConfig } from '@mine-me/shared';
import type { ParticleEngine, EmitterHandle } from '../../ParticleCanvas/ParticleEngine';

/**
 * Keeps one emitter running at the held item's particle origin in the hold preview.
 * `sync` is called every frame with the effect (or null) and the origin in stage space:
 * it starts the emitter, moves it with the swing, swaps it when the effect changes, and removes it
 * when there is nothing to show.
 */
export class HeldParticleEmitter {
  private emitter: EmitterHandle | null = null;
  private config: ParticleEffectConfig | null = null;

  public hasEmitter(): boolean {
    return this.emitter !== null;
  }

  public sync(
    engine: ParticleEngine,
    config: ParticleEffectConfig | null,
    position: { x: number; y: number } | null
  ): void {
    if (!config || !position) {
      this.clear();
      return;
    }
    if (this.emitter && this.config !== config) this.clear();
    if (!this.emitter) {
      this.emitter = engine.addEmitter(config, position);
      this.config = config;
      return;
    }
    this.emitter.setPosition(position);
  }

  public clear(): void {
    this.emitter?.destroy();
    this.emitter = null;
    this.config = null;
  }
}
