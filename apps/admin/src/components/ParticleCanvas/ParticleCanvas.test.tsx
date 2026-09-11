import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ParticleCanvas from './ParticleCanvas';
import type { ParticleEffectConfig } from '@mine-me/shared';

// Mock PixiJS Application
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn(), removeChild: vi.fn() };
    renderer = {};
    ticker = { add: vi.fn(), remove: vi.fn() };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  },
  Container: class {
    addChild = vi.fn();
    removeChild = vi.fn();
    destroy = vi.fn();
  },
  Sprite: class {
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    tint = 0xffffff;
    rotation = 0;
    visible = true;
    alpha = 1;
    destroy = vi.fn();
  },
  Texture: {
    WHITE: { destroy: vi.fn() },
  },
  Graphics: class {
    circle = vi.fn().mockReturnThis();
    rect = vi.fn().mockReturnThis();
    poly = vi.fn().mockReturnThis();
    fill = vi.fn().mockReturnThis();
    destroy = vi.fn();
  },
}));

const mockConfig: ParticleEffectConfig = {
  emitterType: 'burst',
  shape: 'pixel',
  burstCount: 10,
  lifetime: { min: 0.5, max: 0.5 },
  speed: { min: 50, max: 100 },
  angle: { min: 0, max: 360 },
  scale: { start: 1, end: 0 },
  alpha: { start: 1, end: 0 },
  color: { start: '#ffffff', end: '#000000' },
};

describe('ParticleCanvas Component', () => {
  it('renders viewport, HUD, and toolbar buttons', async () => {
    render(<ParticleCanvas config={mockConfig} />);

    expect(screen.getByText(/FPS:/i)).toBeDefined();
    expect(screen.getByText(/Particles:/i)).toBeDefined();
    expect(screen.getByText('💥 Trigger Burst')).toBeDefined();
    expect(screen.getByText('Clear')).toBeDefined();
  });

  it('toggles pause and play state', async () => {
    render(<ParticleCanvas config={mockConfig} />);

    const pauseBtn = screen.getByText(/Pause/i);
    expect(pauseBtn).toBeDefined();

    fireEvent.click(pauseBtn);
    expect(screen.getByText(/Play/i)).toBeDefined();
  });

  it('switches background theme', async () => {
    render(<ParticleCanvas config={mockConfig} />);

    const checkerBtn = screen.getByText('checkerboard');
    fireEvent.click(checkerBtn);
    expect(checkerBtn.className).toContain('bg-sky-600');
  });
});
