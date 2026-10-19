import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MiningModeIndicator } from './MiningModeIndicator';
import { MiningMouseController } from '../MiningGrid/input/MiningMouseController';

describe('MiningModeIndicator', () => {
  afterEach(cleanup);

  it('shows auto-target by default and single block after the mode switches', () => {
    const controller = new MiningMouseController();
    render(<MiningModeIndicator controller={controller} />);
    const button = screen.getByTestId('mining-mode-indicator');
    expect(button.dataset.mode).toBe('auto');
    expect(button.textContent).toContain('Auto target');
    act(() => controller.setPreciseMode(true));
    expect(button.dataset.mode).toBe('single');
    expect(button.textContent).toContain('Single block');
  });

  it('clicking it switches the mode of the controller', () => {
    const controller = new MiningMouseController();
    render(<MiningModeIndicator controller={controller} />);
    fireEvent.click(screen.getByTestId('mining-mode-indicator'));
    expect(controller.isPreciseMining()).toBe(true);
    fireEvent.click(screen.getByTestId('mining-mode-indicator'));
    expect(controller.isPreciseMining()).toBe(false);
  });

  it('starts in the mode the controller is already in', () => {
    const controller = new MiningMouseController();
    controller.setPreciseMode(true);
    render(<MiningModeIndicator controller={controller} />);
    expect(screen.getByTestId('mining-mode-indicator').dataset.mode).toBe('single');
  });
});
