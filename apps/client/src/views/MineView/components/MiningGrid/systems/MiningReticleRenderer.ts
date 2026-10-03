import type { Graphics, Texture } from 'pixi.js';
import { MiningTileType } from '@mine-me/shared';
import type { MiningPosition } from '@mine-me/shared';
import type { MiningMouseController } from '../input/MiningMouseController';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';

export interface MiningReticleContext {
  reticleGraphics: Graphics | null;
  mouseController: MiningMouseController | null;
  animTime: number;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  blockTextures?: Map<number, Texture>;
}

export class MiningReticleRenderer {
  public static render(ctx: MiningReticleContext): void {
    const { reticleGraphics, mouseController, animTime, isMining, miningTarget, blockTextures } = ctx;
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
      reticleGraphics.rect(rx, ry, TILE_SIZE, TILE_SIZE);
      reticleGraphics.fill({ color: reticleState.style.color, alpha: reticleState.style.alpha });
      reticleGraphics.stroke({ width: 2, color: reticleState.style.strokeColor, alpha: 0.9 });

      const isMiningThis =
        isMining &&
        miningTarget &&
        miningTarget.x === reticleState.target.x &&
        miningTarget.y === reticleState.target.y;

      if (isMiningThis) {
        const pulse = 0.5 + Math.sin(animTime * 15) * 0.5;
        reticleGraphics.rect(rx + 3, ry + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        reticleGraphics.stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.4 + pulse * 0.5 });
      }

      if (reticleState.style.showPreview) {
        const previewGlow = 0.7 + Math.sin(animTime * 8) * 0.2;
        if (reticleState.style.previewType === 'LADDER') {
          const ladderTex = blockTextures?.get(MiningTileType.LADDER);
          MiningTileRenderer.drawLadder(reticleGraphics, TILE_SIZE, previewGlow, rx, ry, ladderTex);
        } else {
          const torchTex = blockTextures?.get(MiningTileType.TORCH);
          MiningTileRenderer.drawTorch(reticleGraphics, TILE_SIZE, previewGlow, rx, ry, torchTex);
        }
      }
    }
  }
}
