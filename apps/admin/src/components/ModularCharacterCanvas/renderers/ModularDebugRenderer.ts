import type { Graphics, Sprite } from 'pixi.js';
import type { CharacterJointNodes } from '../animation/ModularAnimationEngine';

export class ModularDebugRenderer {
  public static renderDebug(
    g: Graphics,
    nodes: CharacterJointNodes,
    partSprites: Map<string, Sprite>,
    options: {
      showBones: boolean;
      showJoints: boolean;
      showBbox: boolean;
      baseScaleRatio: number;
    }
  ): void {
    g.clear();

    if (!nodes.root || !nodes.torso || !nodes.head || !nodes.armFront || !nodes.armBack || !nodes.legFront || !nodes.legBack || !nodes.toolSocket) {
      return;
    }

    const { showBones, showJoints, showBbox, baseScaleRatio } = options;

    if (showBones) {
      // Draw skeleton connection lines
      g.moveTo(0, 0); // Pelvis
      g.lineTo(nodes.torso.x, nodes.torso.y); // Pelvis -> Torso
      g.lineTo(nodes.torso.x + nodes.head.x, nodes.torso.y + nodes.head.y); // Torso -> Head

      // Pelvis -> Leg Front & Back
      g.moveTo(0, 0);
      g.lineTo(nodes.legFront.x, nodes.legFront.y);
      g.moveTo(0, 0);
      g.lineTo(nodes.legBack.x, nodes.legBack.y);

      // Torso -> Arms
      g.moveTo(nodes.torso.x, nodes.torso.y);
      g.lineTo(nodes.torso.x + nodes.armFront.x, nodes.torso.y + nodes.armFront.y);
      g.moveTo(nodes.torso.x, nodes.torso.y);
      g.lineTo(nodes.torso.x + nodes.armBack.x, nodes.torso.y + nodes.armBack.y);

      g.stroke({ width: 3, color: 0x38bdf8, alpha: 0.8 }); // sky-400
    }

    if (showJoints) {
      // Pelvis joint (Green)
      g.circle(0, 0, 8);
      g.fill(0x22c55e);

      // Head / Neck joint (Yellow)
      g.circle(nodes.torso.x + nodes.head.x, nodes.torso.y + nodes.head.y, 6);
      g.fill(0xfacc15);

      // Shoulder Front & Back (Orange)
      g.circle(nodes.torso.x + nodes.armFront.x, nodes.torso.y + nodes.armFront.y, 6);
      g.fill(0xf97316);
      g.circle(nodes.torso.x + nodes.armBack.x, nodes.torso.y + nodes.armBack.y, 5);
      g.fill(0xf97316);

      // Hip joints (Purple)
      g.circle(nodes.legFront.x, nodes.legFront.y, 6);
      g.fill(0xa855f7);
      g.circle(nodes.legBack.x, nodes.legBack.y, 5);
      g.fill(0xa855f7);

      // Tool socket (Red)
      g.circle(
        nodes.torso.x + nodes.armFront.x + nodes.toolSocket.x,
        nodes.torso.y + nodes.armFront.y + nodes.toolSocket.y,
        6
      );
      g.fill(0xef4444);
    }

    if (showBbox) {
      partSprites.forEach((sprite) => {
        if (!sprite.visible) return;
        const b = sprite.getBounds();
        // Map screen bounds to root container local coordinates
        const localTL = nodes.root!.toLocal({ x: b.x, y: b.y });
        g.rect(localTL.x, localTL.y, b.width / baseScaleRatio, b.height / baseScaleRatio);
        g.stroke({ width: 1.5, color: 0xec4899, alpha: 0.7 }); // pink-500
      });
    }
  }
}
