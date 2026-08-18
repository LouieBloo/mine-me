import type { Container } from 'pixi.js';

export type CharacterAnimationState = 'idle' | 'walk' | 'mine';

export interface CharacterJointNodes {
  root: Container | null;
  pelvis: Container | null;
  torso: Container | null;
  head: Container | null;
  armFront: Container | null;
  armBack: Container | null;
  legFront: Container | null;
  legBack: Container | null;
  toolSocket: Container | null;
}

export interface JointBaseOffsets {
  torso: { x: number; y: number };
  head: { x: number; y: number };
  armFront: { x: number; y: number };
  armBack: { x: number; y: number };
  legFront: { x: number; y: number };
  legBack: { x: number; y: number };
}

export class ModularAnimationEngine {
  public static updateJoints(
    nodes: CharacterJointNodes,
    state: CharacterAnimationState,
    animTime: number,
    baseOffsets: JointBaseOffsets
  ): void {
    if (
      !nodes.torso ||
      !nodes.head ||
      !nodes.armFront ||
      !nodes.armBack ||
      !nodes.legFront ||
      !nodes.legBack
    ) {
      return;
    }

    // Set base X positions
    nodes.armFront.x = baseOffsets.armFront.x;
    nodes.armBack.x = baseOffsets.armBack.x;
    nodes.head.x = baseOffsets.head.x;
    nodes.legFront.x = baseOffsets.legFront.x;
    nodes.legBack.x = baseOffsets.legBack.x;
    nodes.torso.x = baseOffsets.torso.x;

    if (state === 'idle') {
      const breath = Math.sin(animTime * 2.2);
      nodes.torso.rotation = 0;
      nodes.torso.y = baseOffsets.torso.y + breath * 3;
      nodes.head.y = baseOffsets.head.y + breath * 2;
      nodes.head.rotation = breath * 0.02;

      nodes.armFront.y = baseOffsets.armFront.y;
      nodes.armBack.y = baseOffsets.armBack.y;
      nodes.armFront.rotation = breath * 0.04;
      nodes.armBack.rotation = -breath * 0.03;

      nodes.legFront.rotation = 0;
      nodes.legBack.rotation = 0;
      nodes.legFront.y = baseOffsets.legFront.y;
      nodes.legBack.y = baseOffsets.legBack.y;
    } else if (state === 'walk') {
      const freq = 9.0;
      const stride = Math.sin(animTime * freq);
      const strideCos = Math.cos(animTime * freq);
      const bounce = Math.abs(stride) * 8;

      nodes.torso.rotation = 0;
      nodes.torso.y = baseOffsets.torso.y + bounce;
      nodes.head.y = baseOffsets.head.y + bounce * 0.8;
      nodes.head.rotation = stride * 0.03;

      const legAmp = 0.5;
      nodes.legFront.rotation = stride * legAmp;
      nodes.legBack.rotation = -stride * legAmp;

      nodes.legFront.y = baseOffsets.legFront.y - Math.max(0, strideCos) * 6;
      nodes.legBack.y = baseOffsets.legBack.y - Math.max(0, -strideCos) * 6;

      nodes.armFront.y = baseOffsets.armFront.y;
      nodes.armBack.y = baseOffsets.armBack.y;
      nodes.armFront.rotation = -stride * 0.35;
      nodes.armBack.rotation = stride * 0.35;
    } else if (state === 'mine') {
      const swingFreq = 6.0;
      const progress = (animTime * swingFreq) % (Math.PI * 2);
      const swing = Math.sin(progress);

      nodes.armFront.y = baseOffsets.armFront.y;
      nodes.armBack.y = baseOffsets.armBack.y;
      nodes.armFront.rotation = -0.6 + swing * 1.2;
      nodes.torso.rotation = swing > 0 ? 0.12 : -0.05;
      nodes.torso.y = baseOffsets.torso.y + (swing > 0 ? 6 : -2);
      nodes.head.y = baseOffsets.head.y;
      nodes.head.rotation = swing * 0.1;

      nodes.legFront.y = baseOffsets.legFront.y;
      nodes.legBack.y = baseOffsets.legBack.y;
      nodes.legFront.rotation = 0.1;
      nodes.legBack.rotation = -0.15;
    }
  }
}
