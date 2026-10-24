import { useEffect, useRef } from 'react';
import { Application, Container } from 'pixi.js';
import type { ParticleEffectConfig } from '@mine-me/shared';
import { ParticleEngine, type EmitterHandle } from '../ParticleCanvas/ParticleEngine';

/** How often a one-shot (burst) effect is played again, so the owner sees it repeat. */
export const BURST_REPEAT_MS = 1500;

export interface ParticleOverlayApi {
  /** Plays a one-shot effect (a spore puff) at a place, in pixels of the overlay. */
  burst: (config: ParticleEffectConfig, at: { x: number; y: number }) => void;
}

interface Options {
  /** Where the transparent Pixi canvas goes. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  /** The doodad's own effect (null: none). */
  config: ParticleEffectConfig | null;
  /** Where the doodad's effect is right now; read every frame, so it follows a wandering bug. */
  positionRef: React.RefObject<{ x: number; y: number }>;
  /** Whether time is running. */
  playing: boolean;
}

/**
 * Plays the doodad's particle effect over the preview with the admin's own particle engine, so the effect looks as it does
 * on the Particle Effects page. The Pixi canvas is transparent and sits on top of the scene canvas.
 */
export function useParticleOverlay({ containerRef, width, height, config, positionRef, playing }: Options): React.RefObject<ParticleOverlayApi> {
  const engineRef = useRef<ParticleEngine | null>(null);
  const emitterRef = useRef<EmitterHandle | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const apiRef = useRef<ParticleOverlayApi>({
    burst: (cfg, at) => engineRef.current?.spawnBurst(cfg, at),
  });

  // The Pixi application lives as long as the overlay does
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    let destroyed = false;
    let app: Application | null = null;
    let sinceBurst = 0;

    (async () => {
      try {
        const created = new Application();
        await created.init({ backgroundAlpha: 0, antialias: false, roundPixels: true, width, height });
        if (destroyed) {
          created.destroy({ removeView: true });
          return;
        }
        app = created;
        created.canvas.style.pointerEvents = 'none';
        host.appendChild(created.canvas);
        const layer = new Container();
        created.stage.addChild(layer);
        const engine = new ParticleEngine(layer, created.renderer, 1500);
        engineRef.current = engine;
        const first = configRef.current;
        if (first && first.emitterType === 'continuous') emitterRef.current = engine.addEmitter(first, positionRef.current ?? { x: width / 2, y: height / 2 });
        created.ticker.add((ticker) => {
          if (!playingRef.current) return;
          const dt = ticker.deltaMS / 1000;
          const cfg = configRef.current;
          const at = positionRef.current ?? { x: width / 2, y: height / 2 };
          if (emitterRef.current) emitterRef.current.setPosition(at);
          if (cfg && cfg.emitterType === 'burst') {
            sinceBurst += dt * 1000;
            if (sinceBurst >= BURST_REPEAT_MS) {
              sinceBurst = 0;
              engine.spawnBurst(cfg, at);
            }
          }
          engine.update(dt);
        });
      } catch (err) {
        console.error('Failed to start the doodad particle overlay:', err);
      }
    })();

    return () => {
      destroyed = true;
      emitterRef.current?.destroy();
      emitterRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      if (app) {
        app.destroy({ removeView: true });
        app = null;
      }
    };
  }, [width, height]);

  // A continuous effect is one emitter that follows the doodad; a change of effect replaces it
  useEffect(() => {
    emitterRef.current?.destroy();
    emitterRef.current = null;
    const engine = engineRef.current;
    if (engine && config && config.emitterType === 'continuous') {
      emitterRef.current = engine.addEmitter(config, positionRef.current ?? { x: width / 2, y: height / 2 });
    }
  }, [config, width, height]);

  return apiRef;
}
