import { describe, it, expect, vi } from 'vitest';
import { showTargetingModeText, AUTO_TARGETING_TEXT, SINGLE_TARGETING_TEXT } from './useMiningModeToast';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

const body = { position: { x: 10, y: 20 } };

describe('showTargetingModeText', () => {
  it('pops up white "Single Targeting" above the player in single mode', () => {
    const manager = { spawnStatus: vi.fn() } as any;
    showTargetingModeText(manager, body, true);
    const [x, y, text, color] = manager.spawnStatus.mock.calls[0];
    expect(x).toBe(10 * TILE_SIZE);
    expect(y).toBeLessThan(20 * TILE_SIZE);
    expect(text).toBe(SINGLE_TARGETING_TEXT);
    expect(color).toBe('#ffffff');
  });

  it('pops up "Auto Targeting" in auto mode', () => {
    const manager = { spawnStatus: vi.fn() } as any;
    showTargetingModeText(manager, body, false);
    expect(manager.spawnStatus.mock.calls[0][2]).toBe(AUTO_TARGETING_TEXT);
  });

  it('does nothing without a manager or a player', () => {
    const manager = { spawnStatus: vi.fn() } as any;
    showTargetingModeText(manager, null, true);
    showTargetingModeText(null, body, true);
    expect(manager.spawnStatus).not.toHaveBeenCalled();
  });
});
