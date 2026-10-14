import type { ParticleEffectConfig } from '@mine-me/shared';
import type { ParticleEngine, EmitterHandle } from '../../../../../components/game/particles/ParticleEngine';
import { TILE_SIZE } from './MiningTileRenderer';

export interface BurningBody {
  /** Stable id of the player or mob ('self' for the local player). */
  id: string;
  /** Body centre in tile coordinates. */
  x: number;
  y: number;
}

/**
 * Keeps the burning effect (one particle effect from the map config) on everyone who is on fire, following
 * them. `sync` takes the full list of burning bodies; anyone not in it stops burning visually. `move` lets the
 * caller move one body's flames between ticks (the local player moves every frame).
 */
export class BurningBodies {
  private readonly tileSize: number;
  private particles: ParticleEngine | null = null;
  private effect: ParticleEffectConfig | null = null;
  private readonly emitters = new Map<string, EmitterHandle>();

  constructor(tileSize: number = TILE_SIZE) {
    this.tileSize = tileSize;
  }

  public setup(particles: ParticleEngine | null, effect: ParticleEffectConfig | null | undefined): void {
    if (this.particles !== particles || this.effect !== (effect ?? null)) this.clear();
    this.particles = particles;
    this.effect = effect ?? null;
  }

  public get count(): number {
    return this.emitters.size;
  }

  private pixel(body: { x: number; y: number }): { x: number; y: number } {
    return { x: body.x * this.tileSize, y: body.y * this.tileSize };
  }

  public sync(bodies: readonly BurningBody[]): void {
    if (!this.particles || !this.effect) {
      this.clear();
      return;
    }
    const burning = new Map(bodies.map((b) => [b.id, b]));
    for (const [id, handle] of this.emitters) {
      if (!burning.has(id)) {
        handle.destroy();
        this.emitters.delete(id);
      }
    }
    for (const [id, body] of burning) {
      const existing = this.emitters.get(id);
      if (existing) existing.setPosition(this.pixel(body));
      else this.emitters.set(id, this.particles.addEmitter(this.effect, this.pixel(body)));
    }
  }

  public move(id: string, x: number, y: number): void {
    this.emitters.get(id)?.setPosition(this.pixel({ x, y }));
  }

  public clear(): void {
    for (const handle of this.emitters.values()) handle.destroy();
    this.emitters.clear();
  }

  public destroy(): void {
    this.clear();
    this.particles = null;
  }
}
