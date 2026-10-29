import { describe, it, expect } from 'vitest';
import { Container, Text } from 'pixi.js';
import { MINING_CONFIG } from '@mine-me/shared';
import { ExitMarkerRenderer, exitMarkerPlacement } from './ExitMarkerRenderer';

describe('exitMarkerPlacement', () => {
  it('stands on the ground row in the middle of the spot, as wide as the exit spot', () => {
    const p = exitMarkerPlacement(12, 10);
    expect(p.footX).toBe((MINING_CONFIG.ENTRANCE_X + 0.5) * 10);
    expect(p.footY).toBe((12 + MINING_CONFIG.ENTRANCE_Y) * 10);
    expect(p.zoneWidth).toBe((MINING_CONFIG.ENTRANCE_EXIT_RADIUS * 2 + 1) * 10);
  });

  it('follows the surface row, so sky rows above the ground move it down with the ground', () => {
    expect(exitMarkerPlacement(30, 10).footY - exitMarkerPlacement(0, 10).footY).toBe(300);
  });
});

describe('ExitMarkerRenderer', () => {
  it('adds an EXIT sign to its parent and removes it again', () => {
    const parent = new Container();
    const marker = new ExitMarkerRenderer(parent, 12, 10);
    expect(parent.children).toContain(marker.root);
    const words = marker.root.children.filter((c): c is Text => c instanceof Text).map((t) => t.text);
    expect(words).toEqual(['EXIT']);
    marker.destroy();
    expect(marker.root.destroyed).toBe(true);
  });
});
