import { useEffect } from 'react';
import {
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
} from '@mine-me/shared';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';
import type { MiningClientWorld } from '../systems/MiningClientWorld';

export interface UseMiningAmbientEffectsOptions {
  world: Pick<
    MiningClientWorld,
    | 'tilesContainerRef'
    | 'gridRef'
    | 'blockTexturesRef'
    | 'tileGraphicsMap'
    | 'tileSpritesMap'
    | 'lightingEngineRef'
    | 'particleEngineRef'
    | 'blockParticleConfigsRef'
    | 'torchEmittersRef'
    | 'blockEmittersRef'
  >;
  containersReady: boolean;
  tileTextureLoaded: number;
}

/**
 * Handles initial full-grid rendering and continuous ambient effects
 * (chest lights, torch lights & flame particles, ambient ore sparkles).
 */
export function useMiningAmbientEffects({
  world,
  containersReady,
  tileTextureLoaded,
}: UseMiningAmbientEffectsOptions) {
  const {
    tilesContainerRef,
    gridRef,
    blockTexturesRef,
    tileGraphicsMap,
    tileSpritesMap,
    lightingEngineRef,
    particleEngineRef,
    blockParticleConfigsRef,
    torchEmittersRef,
    blockEmittersRef,
  } = world;
  useEffect(() => {
    const tilesContainer = tilesContainerRef.current;
    if (!tilesContainer || !containersReady) return;

    MiningTileRenderer.renderGrid(
      tilesContainer,
      gridRef.current,
      blockTexturesRef.current,
      tileGraphicsMap.current,
      tileSpritesMap.current,
      TILE_SIZE
    );

    const lightingEngine = lightingEngineRef.current;
    if (lightingEngine) {
      lightingEngine.updateGrid(gridRef.current, true);

      gridRef.current.forEach((row, y) => {
        row.forEach((tile, x) => {
          const chestLightId = `chest_${x}_${y}`;
          const torchLightId = `torch_${x}_${y}`;

          if (tile.revealed && tile.type === MiningTileType.CHEST) {
            if (!lightingEngine.getLight(chestLightId)) {
              lightingEngine.addLight(
                new PointLight(
                  chestLightId,
                  { x: x + 0.5, y: y + 0.5 },
                  0xfbbf24,
                  0.9,
                  2.0,
                  { pulse: { speed: 3.2, minIntensity: 0.5, maxIntensity: 1.0 } }
                )
              );
            }
          }

          if (tile.revealed && tile.type === MiningTileType.TORCH) {
            if (!lightingEngine.getLight(torchLightId)) {
              lightingEngine.addLight(
                new PointLight(
                  torchLightId,
                  { x: x + 0.446, y: y + 0.35 },
                  0xf59e0b,
                  1.25,
                  MINING_CONFIG.TORCH_RADIUS,
                  {
                    flicker: {
                      speed: MINING_CONFIG.TORCH_FLICKER_SPEED,
                      amount: MINING_CONFIG.TORCH_FLICKER_AMOUNT,
                    },
                  }
                )
              );
            }
            if (particleEngineRef.current && !torchEmittersRef.current.has(torchLightId)) {
              const emitter = particleEngineRef.current.addEmitter(
                DEFAULT_PARTICLE_EFFECTS.torch_flame,
                { x: (x + 0.446) * TILE_SIZE, y: (y + 0.28) * TILE_SIZE }
              );
              torchEmittersRef.current.set(torchLightId, emitter);
            }
          }

          // Ambient block particle effects from dynamic config (NO LIGHT)
          const particleConfig = tile.revealed ? blockParticleConfigsRef.current.get(tile.type) : undefined;
          if (particleConfig && particleEngineRef.current) {
            const blockEmitterId = `block_effect_${x}_${y}`;
            if (!blockEmittersRef.current.has(blockEmitterId)) {
              const emitter = particleEngineRef.current.addEmitter(
                particleConfig,
                { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE }
              );
              blockEmittersRef.current.set(blockEmitterId, emitter);
            }
          }
        });
      });
    }

    return () => {
      torchEmittersRef.current.forEach((emitter) => emitter.destroy());
      torchEmittersRef.current.clear();
      blockEmittersRef.current.forEach((emitter) => emitter.destroy());
      blockEmittersRef.current.clear();
    };
  }, [containersReady, tileTextureLoaded]);
}
