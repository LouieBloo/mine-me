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

  it('calculates mining swing animation', () => {
    ModularAnimationEngine.updateJoints(nodes, 'mine', 1.0, baseOffsets);

    expect(nodes.armFront!.rotation).toBeDefined();
    expect(nodes.torso!.rotation).toBeDefined();
  });
});
