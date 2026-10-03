import type { Graphics } from 'pixi.js';
import {
  MINING_CONFIG,
  MINING_TILE_WORLD_PIXELS,
  isTileSolid,
  type Vector2D,
  type MiningPosition,
  type MiningActiveDynamite,
  type MiningDroppedItem,
  type MiningClientTile,
  DEFAULT_DYNAMITE_PHYSICS_CONFIG,
} from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import type { ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import type { MiningMobRenderer } from '../renderers/MiningMobRenderer';

export interface MiningDebugContext {
  debugGraphics: Graphics | null;
  showDebug: boolean;
  currentPos: Vector2D;
  playerFacingDir: Vector2D;
  isFacingLeft: boolean;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  grid?: MiningClientTile[][];
  activeDynamites?: MiningActiveDynamite[];
  activeFallingRocks?: ActiveFallingRock[];
  droppedItems?: MiningDroppedItem[];
  mobRenderer?: MiningMobRenderer | null;
}

export class MiningDebugRenderer {
  public static render(ctx: MiningDebugContext): void {
    const {
      debugGraphics,
      showDebug,
      currentPos,
      playerFacingDir,
      isFacingLeft,
      isMining,
      miningTarget,
      grid,
      activeDynamites,
      activeFallingRocks,
      droppedItems,
      mobRenderer,
    } = ctx;

    if (!debugGraphics) return;
    debugGraphics.clear();
    if (!showDebug) return;

    const playerPixelX = currentPos.x * TILE_SIZE;
    const playerPixelY = currentPos.y * TILE_SIZE;
    const colliderPixelW = (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;
    const colliderPixelH = (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE) * TILE_SIZE;

    // 1. Current Tile Grid Outline
    const tileX = Math.floor(currentPos.x) * TILE_SIZE;
    const tileY = Math.floor(currentPos.y) * TILE_SIZE;
    debugGraphics.rect(tileX, tileY, TILE_SIZE, TILE_SIZE);
    debugGraphics.stroke({ width: 1, color: 0x38bdf8, alpha: 0.5 });

    // 2. Fall & Movement Collider (Green AABB rectangle)
    debugGraphics.rect(
      playerPixelX - colliderPixelW / 2,
      playerPixelY - colliderPixelH / 2,
      colliderPixelW,
      colliderPixelH
    );
    debugGraphics.stroke({ width: 2, color: 0x22c55e, alpha: 0.9 });

    // 3. Ground / Floor Contact Line (Red line)
    const feetY = playerPixelY + colliderPixelH / 2;
    debugGraphics.moveTo(playerPixelX - colliderPixelW / 2, feetY);
    debugGraphics.lineTo(playerPixelX + colliderPixelW / 2, feetY);
    debugGraphics.stroke({ width: 2, color: 0xef4444, alpha: 0.9 });

    // 4. Center Origin Point (Cyan dot)
    debugGraphics.circle(playerPixelX, playerPixelY, 3);
    debugGraphics.fill({ color: 0x06b6d4, alpha: 0.95 });

    // 5. Mining Reach Radius
    const reachPixelRadius = (MINING_CONFIG.PLAYER_MINING_REACH ?? 1.85) * TILE_SIZE;
    debugGraphics.circle(playerPixelX, playerPixelY, reachPixelRadius);
    debugGraphics.stroke({ width: 1.5, color: 0xeab308, alpha: 0.35 });

    // 5b. Melee Attack Swing Arc
    const aimDir = playerFacingDir || { x: isFacingLeft ? -1 : 1, y: 0 };
    const aimAngle = Math.atan2(aimDir.y, aimDir.x);
    const halfSpread = (72.5 * Math.PI) / 180;
    const swingRadius = 2.2 * TILE_SIZE;
    const arcStartAngle = aimAngle - halfSpread;
    const arcEndAngle = aimAngle + halfSpread;

    debugGraphics.moveTo?.(playerPixelX, playerPixelY);
    debugGraphics.arc?.(playerPixelX, playerPixelY, swingRadius, arcStartAngle, arcEndAngle);
    debugGraphics.closePath?.();
    debugGraphics.stroke?.({ width: 1.5, color: 0xf59e0b, alpha: 0.75 });
    debugGraphics.fill?.({ color: 0xf59e0b, alpha: 0.08 });

    // 6. Highlight currently mining target block if active
    if (isMining && miningTarget) {
      const targetX = miningTarget.x * TILE_SIZE;
      const targetY = miningTarget.y * TILE_SIZE;
      debugGraphics.rect(targetX, targetY, TILE_SIZE, TILE_SIZE);
      debugGraphics.stroke({ width: 2.5, color: 0xef4444, alpha: 0.9 });
    }

    // 7. Block Colliders
    if (grid) {
      const minTileX = Math.max(0, Math.floor(currentPos.x - 22));
      const maxTileX = Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.ceil(currentPos.x + 22));
      const minTileY = Math.max(0, Math.floor(currentPos.y - 18));
      const maxTileY = Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.ceil(currentPos.y + 18));

      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const row = grid[ty];
        if (!row) continue;
        for (let tx = minTileX; tx <= maxTileX; tx++) {
          const tile = row[tx];
          if (tile && isTileSolid(tile.type)) {
            const bx = tx * TILE_SIZE;
            const by = ty * TILE_SIZE;
            debugGraphics.rect(bx, by, TILE_SIZE, TILE_SIZE);
            debugGraphics.stroke({ width: 1, color: 0xf97316, alpha: 0.45 });
            debugGraphics.fill({ color: 0xf97316, alpha: 0.08 });
          }
        }
      }
    }

    // 8. Item Colliders (Dynamites)
    if (activeDynamites && activeDynamites.length > 0) {
      for (const dyn of activeDynamites) {
        const px = dyn.position.x * TILE_SIZE;
        const py = dyn.position.y * TILE_SIZE;
        const angle = dyn.angle ?? 0;
        const cfg = dyn.physicsConfig ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const scale = TILE_SIZE / MINING_TILE_WORLD_PIXELS;

        if (cfg.colliderType === 'CIRCLE') {
          const radius = (cfg.colliderRadius ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderRadius ?? 8) * scale;
          const ox = (cfg.colliderOffsetX ?? 0) * scale;
          const oy = (cfg.colliderOffsetY ?? 0) * scale;
          const cx = px + (ox * cos - oy * sin);
          const cy = py + (ox * sin + oy * cos);

          debugGraphics.circle(cx, cy, radius);
          debugGraphics.stroke({ width: 2, color: 0x06b6d4, alpha: 0.95 });
          debugGraphics.fill({ color: 0x06b6d4, alpha: 0.25 });

          debugGraphics.moveTo(cx, cy);
          debugGraphics.lineTo(cx + cos * radius, cy + sin * radius);
          debugGraphics.stroke({ width: 2, color: 0x22d3ee, alpha: 1 });
        } else {
          const w = (cfg.colliderWidth ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderWidth ?? 32) * scale;
          const h = (cfg.colliderHeight ?? DEFAULT_DYNAMITE_PHYSICS_CONFIG.colliderHeight ?? 10) * scale;
          const hw = w / 2;
          const hh = h / 2;
          const ox = (cfg.colliderOffsetX ?? 0) * scale;
          const oy = (cfg.colliderOffsetY ?? 0) * scale;

          const localCorners = [
            { x: ox - hw, y: oy - hh },
            { x: ox + hw, y: oy - hh },
            { x: ox + hw, y: oy + hh },
            { x: ox - hw, y: oy + hh },
          ];

          const worldCorners = localCorners.map((pt) => ({
            x: px + (pt.x * cos - pt.y * sin),
            y: py + (pt.x * sin + pt.y * cos),
          }));

          debugGraphics.poly(worldCorners).fill({ color: 0x38bdf8, alpha: 0.25 }).stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });

          const tipX = px + (ox * cos - (oy - hh) * sin);
          const tipY = py + (ox * sin + (oy - hh) * cos);
          debugGraphics.moveTo(px, py);
          debugGraphics.lineTo(tipX, tipY);
          debugGraphics.stroke({ width: 2, color: 0xfacc15, alpha: 0.95 });
        }

        debugGraphics.circle(px, py, 2.5);
        debugGraphics.fill({ color: 0xef4444, alpha: 1 });
      }
    }

    // 9. Falling Rock Colliders
    if (activeFallingRocks && activeFallingRocks.length > 0) {
      for (const rock of activeFallingRocks) {
        const rx = rock.x * TILE_SIZE;
        const ry = rock.y * TILE_SIZE;
        const rockRadius = 0.42 * TILE_SIZE;
        debugGraphics.circle(rx, ry, rockRadius);
        debugGraphics.stroke({ width: 2, color: 0xa855f7, alpha: 0.9 });
        debugGraphics.fill({ color: 0xa855f7, alpha: 0.2 });
        debugGraphics.circle(rx, ry, 2.5);
        debugGraphics.fill({ color: 0xc084fc, alpha: 1 });
      }
    }

    // 10. Dropped Item Colliders
    if (droppedItems && droppedItems.length > 0) {
      for (const item of droppedItems) {
        const cfg = item.physicsConfig;
        if (!cfg || cfg.colliderType === 'NONE') continue;

        const px = (item.position.x + 0.5) * TILE_SIZE;
        const py = (item.position.y + 0.5) * TILE_SIZE;

        if (cfg.colliderType === 'CIRCLE') {
          const radius = cfg.colliderRadius ?? 8;
          const ox = cfg.colliderOffsetX ?? 0;
          const oy = cfg.colliderOffsetY ?? 0;
          debugGraphics.circle(px + ox, py + oy, radius);
          debugGraphics.stroke({ width: 1.5, color: 0x10b981, alpha: 0.95 });
          debugGraphics.fill({ color: 0x10b981, alpha: 0.2 });
        } else if (cfg.colliderType === 'RECTANGLE') {
          const w = cfg.colliderWidth ?? 16;
          const h = cfg.colliderHeight ?? 16;
          const ox = cfg.colliderOffsetX ?? 0;
          const oy = cfg.colliderOffsetY ?? 0;
          debugGraphics.rect(px + ox - w / 2, py + oy - h / 2, w, h);
          debugGraphics.stroke({ width: 1.5, color: 0x10b981, alpha: 0.95 });
          debugGraphics.fill({ color: 0x10b981, alpha: 0.2 });
        }
      }
    }

    // 11. Active Mob Colliders & Hitboxes
    if (mobRenderer) {
      mobRenderer.renderDebugHitboxes(debugGraphics, TILE_SIZE);
    }
  }
}
