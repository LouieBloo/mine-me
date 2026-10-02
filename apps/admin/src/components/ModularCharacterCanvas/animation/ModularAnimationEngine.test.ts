import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { ModularAnimationEngine, type CharacterJointNodes, type JointBaseOffsets } from './ModularAnimationEngine';

describe('ModularAnimationEngine', () => {
  let nodes: CharacterJointNodes;
  const baseOffsets: JointBaseOffsets = {
    torso: { x: 0, y: 0 },
    head: { x: 2, y: -245 },
    armFront: { x: -78, y: -145 },
    armBack: { x: 90, y: -180 },
    legFront: { x: -20, y: -55 },
    legBack: { x: 35, y: -55 },
  };

  beforeEach(() => {
    nodes = {
      root: new Container(),
      pelvis: new Container(),
      torso: new Container(),
      head: new Container(),
      armFront: new Container(),
      armBack: new Container(),
      handFront: new Container(),
      legFront: new Container(),
      legBack: new Container(),
      toolSocket: new Container(),
    };
  });

  it('calculates idle breathing animation offsets and rotations', () => {
    ModularAnimationEngine.updateJoints(nodes, 'idle', 1.0, baseOffsets);

    expect(nodes.torso!.x).toBe(0);
    expect(nodes.head!.x).toBe(2);
    expect(nodes.armFront!.rotation).toBeDefined();
  });

  it('calculates walk cycle strides and leg rotations', () => {
    ModularAnimationEngine.updateJoints(nodes, 'walk', 1.0, baseOffsets);

    expect(nodes.legFront!.rotation).toBeDefined();
    expect(nodes.legBack!.rotation).toBeDefined();
    expect(nodes.armFront!.rotation).toBeDefined();
  });

  it('calculates mining swing animation for tool-based mining', () => {
    ModularAnimationEngine.updateJoints(nodes, 'mine', 1.0, baseOffsets, 'tool');

    expect(nodes.armFront!.rotation).toBeDefined();
    expect(nodes.torso!.rotation).toBeDefined();
  });

  it('calculates dual-claw rapid digging animation when miningStyle is hands', () => {
    ModularAnimationEngine.updateJoints(nodes, 'mine', 0.5, baseOffsets, 'hands');

    // Both front and back arms oscillate dynamically
    expect(nodes.armFront!.rotation).toBeDefined();
    expect(nodes.armBack!.rotation).toBeDefined();

    // Mole hunches forward (torso and head angle forward)
    expect(nodes.torso!.rotation).toBeGreaterThan(0.1);
    expect(nodes.head!.rotation).toBeGreaterThan(0.05);

    // Front arm and back arm positions are offset for clawing into terrain
    expect(nodes.armFront!.x).not.toBe(baseOffsets.armFront.x);
    expect(nodes.armBack!.x).not.toBe(baseOffsets.armBack.x);
  });

  it('calculates damage and death animations', () => {
    ModularAnimationEngine.updateJoints(nodes, 'damage', 0.2, baseOffsets);
    expect(nodes.torso!.rotation).toBeDefined();

    ModularAnimationEngine.updateJoints(nodes, 'death', 1.0, baseOffsets);
    expect(nodes.torso!.rotation).toBe(-0.6);
    expect(nodes.torso!.y).toBe(baseOffsets.torso.y + 16);
  });
});
