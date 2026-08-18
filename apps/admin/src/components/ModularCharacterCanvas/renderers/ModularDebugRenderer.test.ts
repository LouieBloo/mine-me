import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, Graphics, Sprite } from 'pixi.js';
import { ModularDebugRenderer } from './ModularDebugRenderer';
import type { CharacterJointNodes } from '../animation/ModularAnimationEngine';

describe('ModularDebugRenderer', () => {
  let g: Graphics;
  let nodes: CharacterJointNodes;
  let partSprites: Map<string, Sprite>;

  beforeEach(() => {
    g = new Graphics();
    nodes = {
      root: new Container(),
      pelvis: new Container(),
      torso: new Container(),
      head: new Container(),
      armFront: new Container(),
      armBack: new Container(),
      legFront: new Container(),
      legBack: new Container(),
      toolSocket: new Container(),
    };
    partSprites = new Map();
  });

  it('draws skeleton bones and joints when enabled', () => {
    const moveToSpy = vi.spyOn(g, 'moveTo');
    const lineToSpy = vi.spyOn(g, 'lineTo');
    const circleSpy = vi.spyOn(g, 'circle');

    ModularDebugRenderer.renderDebug(g, nodes, partSprites, {
      showBones: true,
      showJoints: true,
      showBbox: false,
      baseScaleRatio: 1.0,
    });

    expect(moveToSpy).toHaveBeenCalled();
    expect(lineToSpy).toHaveBeenCalled();
    expect(circleSpy).toHaveBeenCalled();
  });
});
