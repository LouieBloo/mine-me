import type { Graphics, Texture } from 'pixi.js';
import { MiningTileType, autotileCorners, autotileMask, isAutotileTerrain } from '@mine-me/shared';
import type { MiningClientTile, MiningPosition } from '@mine-me/shared';
import { autotileVariants } from '../renderers/AutotileVariants';
import type { MiningMouseController } from '../input/MiningMouseController';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';

/** The faint white square drawn over each block the pickaxe has lined up besides the one under the cursor. */
export const QUEUED_BLOCK_COLOR = 0xffffff;
export const QUEUED_BLOCK_ALPHA = 0.12;

export interface MiningReticleContext {
  reticleGraphics: Graphics | null;
  mouseController: MiningMouseController | null;
  animTime: number;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  blockTextures?: Map<number, Texture>;
  /** The mine's tiles, so a highlight over terrain can take the shape the block is drawn with. */
  grid?: MiningClientTile[][];
}

/**
 * Adds the outline of one cell to `graphics` (to be filled or stroked by the caller). A terrain block is drawn with
 * rounded outer corners (autotiling), so its highlight has the same corners; anything else is a plain square.
 * `inset` shrinks the outline on every side.
 */
export function traceCellShape(graphics: Graphics, grid: MiningClientTile[][] | undefined, cellX: number, cellY: number, inset = 0): void {
  const x = cellX * TILE_SIZE + inset;
  const y = cellY * TILE_SIZE + inset;
  const size = TILE_SIZE - inset * 2;
  const tile = grid?.[cellY]?.[cellX];
  if (!grid || !tile || !isAutotileTerrain(tile)) {
    graphics.rect(x, y, size, size);
    return;
  }
  const corners = autotileCorners(autotileMask(grid, cellX, cellY));
  const radius = Math.max(0, Math.min(autotileVariants.styleFor(tile.type).radius * TILE_SIZE - inset, size / 2));
  const tl = corners.topLeft ? radius : 0;
  const tr = corners.topRight ? radius : 0;
  const br = corners.bottomRight ? radius : 0;
  const bl = corners.bottomLeft ? radius : 0;
  if (tl + tr + br + bl === 0) {
    graphics.rect(x, y, size, size);
    return;
  }
  graphics.moveTo(x + tl, y);
  graphics.lineTo(x + size - tr, y);
  if (tr) graphics.arc(x + size - tr, y + tr, tr, -Math.PI / 2, 0);
  graphics.lineTo(x + size, y + size - br);
  if (br) graphics.arc(x + size - br, y + size - br, br, 0, Math.PI / 2);
  graphics.lineTo(x + bl, y + size);
  if (bl) graphics.arc(x + bl, y + size - bl, bl, Math.PI / 2, Math.PI);
  graphics.lineTo(x, y + tl);
  if (tl) graphics.arc(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5);
  graphics.closePath();
}

export class MiningReticleRenderer {
  public static render(ctx: MiningReticleContext): void {
    const { reticleGraphics, mouseController, animTime, isMining, miningTarget, blockTextures, grid } = ctx;
    if (!reticleGraphics || !mouseController) return;

    reticleGraphics.clear();
    reticleGraphics.position.set(0, 0);
    const reticleState = mouseController.getReticleState();
    if (!reticleState.active || !reticleState.target || !reticleState.style) return;

    const rx = reticleState.target.x * TILE_SIZE;
    const ry = reticleState.target.y * TILE_SIZE;

    if (reticleState.style.isFreeAim) {
      const isCharging = reticleState.style.isCharging;
      const isOvercharged = reticleState.style.isOvercharged;
      const chargeRatio = reticleState.style.chargeRatio ?? 0;
      const trajectoryPoints = reticleState.style.trajectoryPoints;

      let aimColor = reticleState.style.strokeColor ?? 0xef4444;
      let aimAlpha = reticleState.style.alpha ?? 0.85;

      if (isOvercharged) {
        aimColor = 0x6b7280;
        aimAlpha = 0.4;
      } else if (isCharging) {
        if (chargeRatio >= 0.99) {
          const pulse = 0.8 + Math.sin(animTime * 20) * 0.2;
          aimColor = 0xf59e0b;
          aimAlpha = pulse;
        } else if (chargeRatio > 0.5) {
          aimColor = 0xf97316;
          aimAlpha = 0.9;
        } else {
          aimColor = 0xef4444;
          aimAlpha = 0.85;
        }
      }

      if (isCharging && !isOvercharged && trajectoryPoints && trajectoryPoints.length > 1) {
        // Glowing parabola arc
        reticleGraphics.beginPath();
        reticleGraphics.moveTo(trajectoryPoints[0].x * TILE_SIZE, trajectoryPoints[0].y * TILE_SIZE);
        for (let i = 1; i < trajectoryPoints.length; i++) {
          reticleGraphics.lineTo(trajectoryPoints[i].x * TILE_SIZE, trajectoryPoints[i].y * TILE_SIZE);
        }
        reticleGraphics.stroke({ width: 4, color: aimColor, alpha: 0.3 });

        reticleGraphics.beginPath();
        reticleGraphics.moveTo(trajectoryPoints[0].x * TILE_SIZE, trajectoryPoints[0].y * TILE_SIZE);
        for (let i = 1; i < trajectoryPoints.length; i++) {
          reticleGraphics.lineTo(trajectoryPoints[i].x * TILE_SIZE, trajectoryPoints[i].y * TILE_SIZE);
        }
        reticleGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });

        // Trajectory beads along arc
        for (let i = 0; i < trajectoryPoints.length; i += 2) {
          const pt = trajectoryPoints[i];
          const ptX = pt.x * TILE_SIZE;
          const ptY = pt.y * TILE_SIZE;
          reticleGraphics.beginPath();
          reticleGraphics.circle(ptX, ptY, 2.5);
          reticleGraphics.fill({ color: aimColor, alpha: 0.85 });
        }

        // Landing / Impact marker
        const endPt = trajectoryPoints[trajectoryPoints.length - 1];
        const endX = endPt.x * TILE_SIZE;
        const endY = endPt.y * TILE_SIZE;
        reticleGraphics.beginPath();
        reticleGraphics.circle(endX, endY, 6);
        reticleGraphics.stroke({ width: 2, color: aimColor, alpha: 0.9 });
        reticleGraphics.beginPath();
        reticleGraphics.circle(endX, endY, 2.5);
        reticleGraphics.fill({ color: 0xffffff, alpha: 0.95 });
      }

      const ringRadius = isCharging && chargeRatio >= 0.99 ? 11 : 9;
      reticleGraphics.beginPath();
      reticleGraphics.circle(rx, ry, ringRadius);
      reticleGraphics.stroke({ width: 2, color: aimColor, alpha: aimAlpha });

      reticleGraphics.beginPath();
      reticleGraphics.circle(rx, ry, 2);
      reticleGraphics.fill({ color: aimColor, alpha: aimAlpha });
    } else {
      // The blocks lined up behind the cursor's block (auto targeting) get a light white square; the cursor's own block keeps its normal look
      for (const cell of reticleState.style.miningQueue ?? []) {
        if (cell.x === reticleState.target.x && cell.y === reticleState.target.y) continue;
        traceCellShape(reticleGraphics, grid, cell.x, cell.y);
        reticleGraphics.fill({ color: QUEUED_BLOCK_COLOR, alpha: QUEUED_BLOCK_ALPHA });
      }

      // A multi-cell placement's reticle covers the whole piece, wherever it was nudged to
      const area = reticleState.style.pieceArea;
      const px = area ? area.x * TILE_SIZE : rx;
      const py = area ? area.y * TILE_SIZE : ry;
      const pieceSize = area ? area.width * TILE_SIZE : TILE_SIZE;
      if (area) reticleGraphics.rect(px, py, pieceSize, area.height * TILE_SIZE);
      else traceCellShape(reticleGraphics, grid, reticleState.target.x, reticleState.target.y);
      reticleGraphics.fill({ color: reticleState.style.color, alpha: reticleState.style.alpha });
      reticleGraphics.stroke({ width: 2, color: reticleState.style.strokeColor, alpha: 0.9 });

      const isMiningThis =
        isMining &&
        miningTarget &&
        miningTarget.x === reticleState.target.x &&
        miningTarget.y === reticleState.target.y;

      if (isMiningThis) {
        const pulse = 0.5 + Math.sin(animTime * 15) * 0.5;
        traceCellShape(reticleGraphics, grid, reticleState.target.x, reticleState.target.y, 3);
        reticleGraphics.stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.4 + pulse * 0.5 });
      }

      if (reticleState.style.showPreview) {
        const previewGlow = 0.7 + Math.sin(animTime * 8) * 0.2;
        if (reticleState.style.previewType === 'LADDER') {
          const ladderTex = blockTextures?.get(MiningTileType.LADDER);
          MiningTileRenderer.drawLadder(reticleGraphics, pieceSize, previewGlow, px, py, ladderTex);
        } else if (reticleState.style.previewType === 'BRIDGE') {
          const bridgeTex = blockTextures?.get(MiningTileType.BRIDGE);
          MiningTileRenderer.drawBridge(reticleGraphics, pieceSize, previewGlow, px, py, bridgeTex);
        } else {
          const torchTex = blockTextures?.get(MiningTileType.TORCH);
          MiningTileRenderer.drawTorch(reticleGraphics, pieceSize, previewGlow, px, py, torchTex);
        }
      }
    }
  }
}
