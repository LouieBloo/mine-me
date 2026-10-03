import type { Container, Graphics, Sprite, Texture } from 'pixi.js';
import {
  MINING_CONFIG,
  MiningTileType,
  isTileSolid,
  type MiningActiveDynamite,
  type MiningActiveProjectile,
  type MiningDroppedItem,
  type MiningClientTile,
  DEFAULT_PARTICLE_EFFECTS,
} from '@mine-me/shared';
import { MiningEntityRenderer, type ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { MiningMobRenderer } from '../renderers/MiningMobRenderer';
import type { SoundManager } from '../../../../../services/sound';
import { miningProfiler } from '../utils/MiningProfiler';

export interface MiningLocalSimulationContext {
  fallingRocksContainer: Container | null;
  activeFallingRocks: ActiveFallingRock[];
  fallingRockGraphicsMap: Map<string, Sprite | Graphics>;
  blockTextures?: Map<number, Texture>;

  dynamitesContainer?: Container | null;
  activeDynamites?: MiningActiveDynamite[];
  dynamiteGraphicsMap?: Map<string, Sprite | Graphics>;
  dynamiteTexture?: Texture | null;
  dynamiteVisualManager?: DynamiteVisualManager | null;

  projectilesContainer?: Container | null;
  activeProjectilesRef?: React.MutableRefObject<MiningActiveProjectile[]>;
  projectileGraphicsMap?: Map<string, Sprite | Graphics>;
  bulletTexture?: Texture | null;
  bulletScale?: number;
  projectileVisualManager?: ProjectileVisualManager | null;

  droppedItemVisualManager?: DroppedItemVisualManager | null;
  droppedItems?: MiningDroppedItem[];

  mobRenderer?: MiningMobRenderer | null;
  grid?: MiningClientTile[][];
  lightingEngine?: LightingEngine | null;
  particleEngine?: ParticleEngine | null;
  soundManager?: SoundManager | null;
}

export class MiningLocalSimulationSystem {
  public static update(ctx: MiningLocalSimulationContext, dt: number): void {
    const {
      fallingRocksContainer,
      activeFallingRocks,
      fallingRockGraphicsMap,
      blockTextures,
      dynamitesContainer,
      activeDynamites,
      dynamiteGraphicsMap,
      dynamiteTexture,
      dynamiteVisualManager,
      projectilesContainer,
      activeProjectilesRef,
      projectileGraphicsMap,
      bulletTexture,
      bulletScale,
      projectileVisualManager,
      droppedItemVisualManager,
      droppedItems,
      mobRenderer,
      grid,
      lightingEngine,
      particleEngine,
      soundManager,
    } = ctx;

    miningProfiler.startSection('Falling Rocks');
    if (fallingRocksContainer) {
      if (activeFallingRocks) {
        for (const rock of activeFallingRocks) {
          if (typeof rock.angle === 'number') {
            rock.angle += 2.5 * dt;
          }
        }
      }
      const rockTexture = blockTextures?.get(MiningTileType.ROCK);
      MiningEntityRenderer.updateFallingRocks(
        fallingRocksContainer,
        activeFallingRocks,
        fallingRockGraphicsMap,
        TILE_SIZE,
        rockTexture
      );
    }

    miningProfiler.startSection('Dynamites');
    if (dynamitesContainer && activeDynamites && dynamiteGraphicsMap) {
      for (const dyn of activeDynamites) {
        if (dyn.velocity) {
          dyn.position.x += dyn.velocity.x * dt;
          dyn.position.y += dyn.velocity.y * dt;
          dyn.velocity.y += MINING_CONFIG.GRAVITY * 0.8 * dt;
        }
        if (typeof dyn.angularVelocity === 'number') {
          dyn.angle = (dyn.angle ?? 0) + dyn.angularVelocity * dt;
        }
      }

      MiningEntityRenderer.updateActiveDynamites(
        dynamitesContainer,
        activeDynamites,
        dynamiteGraphicsMap,
        TILE_SIZE,
        dynamiteTexture
      );
    }

    // Update active flying projectiles (bullets)
    if (projectilesContainer && activeProjectilesRef && projectileGraphicsMap) {
      const survivingProjectiles: MiningActiveProjectile[] = [];
      for (const proj of activeProjectilesRef.current) {
        if (proj.hasHit) {
          proj.impactTimer = (proj.impactTimer ?? 0.09) - dt;
          proj.alpha = Math.max(0, (proj.impactTimer ?? 0) / 0.09);
          if ((proj.impactTimer ?? 0) > 0) {
            survivingProjectiles.push(proj);
          }
          continue;
        }

        proj.lifeTime = (proj.lifeTime ?? 0) + dt;
        if ((proj.lifeTime ?? 0) > 3.0) {
          continue;
        }

        const prevX = proj.position.x;
        const prevY = proj.position.y;

        if (proj.velocity) {
          proj.position.x += proj.velocity.x * dt;
          proj.position.y += proj.velocity.y * dt;
        }

        const moveDx = proj.position.x - prevX;
        const moveDy = proj.position.y - prevY;
        const moveDist = Math.hypot(moveDx, moveDy);
        proj.distanceTraveled = (proj.distanceTraveled ?? 0) + moveDist;
        if ((proj.distanceTraveled ?? 0) > 40) {
          continue;
        }

        let hit = false;
        let hitX = proj.position.x;
        let hitY = proj.position.y;
        let isOutOfBounds = false;

        // Check collision for client-predicted bullets against solid tiles and cavern bounds
        if (proj.id.startsWith('client_proj_') && grid) {
          const maxW = grid[0]?.length || MINING_CONFIG.GRID_WIDTH;
          const maxH = grid.length || MINING_CONFIG.GRID_HEIGHT;

          const steps = Math.max(1, Math.ceil(moveDist / 0.2));
          for (let s = 1; s <= steps; s++) {
            const checkX = prevX + (moveDx * s) / steps;
            const checkY = prevY + (moveDy * s) / steps;
            const tx = Math.floor(checkX);
            const ty = Math.floor(checkY);

            if (checkX < -20 || checkX >= maxW + 20 || checkY < -40 || checkY >= maxH + 10) {
              isOutOfBounds = true;
              break;
            }

            if (ty >= 0 && (tx < 0 || tx >= maxW || ty >= maxH)) {
              hit = true;
              hitX = Math.max(0, Math.min(maxW - 0.01, checkX));
              hitY = Math.min(maxH - 0.01, checkY);
              break;
            }

            if (ty < 0) {
              continue;
            }

            const spawnDist = proj.spawnPosition
              ? Math.hypot(checkX - proj.spawnPosition.x, checkY - proj.spawnPosition.y)
              : (proj.distanceTraveled ?? 0);

            if (spawnDist >= 0.35) {
              const tile = grid[ty]?.[tx];
              if (tile && isTileSolid(tile.type as any)) {
                hit = true;
                hitX = checkX;
                hitY = checkY;
                break;
              }
            }
          }

          if (isOutOfBounds) {
            continue;
          }

          if (!hit && mobRenderer) {
            const mobsMap = (mobRenderer as any).mobs;
            if (mobsMap && mobsMap instanceof Map) {
              for (const mob of mobsMap.values()) {
                if (mob.health > 0 && mob.animationState !== 'death') {
                  const mobPos = mob.currentPos || mob.targetPos;
                  if (mobPos) {
                    const d = Math.hypot(proj.position.x - mobPos.x, proj.position.y - mobPos.y);
                    if (d < 0.75) {
                      hit = true;
                      hitX = mobPos.x;
                      hitY = mobPos.y;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (hit) {
            proj.hasHit = true;
            proj.position.x = hitX;
            proj.position.y = hitY;
            proj.velocity = { x: 0, y: 0 };
            proj.impactTimer = 0.09;
            proj.alpha = 1.0;

            if (particleEngine) {
              particleEngine.spawnBurst(
                DEFAULT_PARTICLE_EFFECTS.gun_muzzle_flash,
                { x: hitX * TILE_SIZE, y: hitY * TILE_SIZE }
              );
            }

            if (lightingEngine) {
              projectileVisualManager?.addImpactFlashLight(
                { x: hitX, y: hitY },
                lightingEngine
              );
            }
          }
        }

        survivingProjectiles.push(proj);
      }
      activeProjectilesRef.current = survivingProjectiles;

      MiningEntityRenderer.updateActiveProjectiles(
        projectilesContainer,
        activeProjectilesRef.current,
        projectileGraphicsMap,
        TILE_SIZE,
        bulletTexture,
        bulletScale
      );
    }

    projectileVisualManager?.update(dt, lightingEngine);

    dynamiteVisualManager?.update(
      activeDynamites || [],
      dt,
      particleEngine,
      lightingEngine,
      TILE_SIZE,
      soundManager
    );

    droppedItemVisualManager?.update(
      droppedItems || [],
      dt,
      particleEngine,
      lightingEngine,
      TILE_SIZE
    );
  }
}
