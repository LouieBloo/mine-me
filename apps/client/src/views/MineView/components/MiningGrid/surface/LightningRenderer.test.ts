import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { LightningRenderer, REDUCED_FLASH_CAP, cappedFlash } from './LightningRenderer';

const HORIZON = 600;
const view = { left: 0, top: 0, width: 800, height: 700 };
const strike = { time: 12.5, x: 0.25, distance: 0.2, thunderDelay: 1.35 };

describe('cappedFlash', () => {
  it('passes a flash through, caps it for the reduce-flashes setting, and keeps it in 0 to 1', () => {
    expect(cappedFlash(0.8, false)).toBe(0.8);
    expect(cappedFlash(1, true)).toBe(REDUCED_FLASH_CAP);
    expect(cappedFlash(0.1, true)).toBe(0.1);
    expect(cappedFlash(7, false)).toBe(1);
    expect(cappedFlash(-3, false)).toBe(0);
  });
});

describe('LightningRenderer', () => {
  const make = () => {
    const parent = new Container();
    return { parent, lightning: new LightningRenderer(parent) };
  };

  it('is hidden until there is a flash', () => {
    const { parent, lightning } = make();
    expect(parent.children).toContain(lightning.root);
    expect(lightning.root.visible).toBe(false);
    lightning.update(view, HORIZON, 0, null, false);
    expect(lightning.root.visible).toBe(false);
    expect(lightning.flashLevel).toBe(0);
  });

  it('flashes the sky and draws a bolt where the strike is, from the top of the view down to the ground', () => {
    const { lightning } = make();
    lightning.update(view, HORIZON, 1, strike, false);
    expect(lightning.root.visible).toBe(true);
    expect(lightning.flashLevel).toBe(1);
    const bolt = lightning.root.children[1] as Graphics;
    expect(bolt.visible).toBe(true);
    const bounds = bolt.getLocalBounds();
    expect(bounds.minY).toBeLessThanOrEqual(1);
    expect(bounds.maxY).toBeGreaterThan(HORIZON * 0.9);
    expect(bounds.maxY).toBeLessThanOrEqual(HORIZON + 5); // (the line has width)
    expect(bolt.getLocalBounds().minX).toBeGreaterThan(0);
  });

  it('caps the brightness and skips the bolt when the player reduces flashes', () => {
    const { lightning } = make();
    lightning.update(view, HORIZON, 1, strike, true);
    expect(lightning.flashLevel).toBe(REDUCED_FLASH_CAP);
    expect((lightning.root.children[1] as Graphics).visible).toBe(false);
  });

  it('draws nothing when the sky is not in view (underground the flash is not seen)', () => {
    const { lightning } = make();
    lightning.update({ ...view, top: HORIZON + 50 }, HORIZON, 1, strike, false);
    expect(lightning.root.visible).toBe(false);
    expect(lightning.flashLevel).toBe(0);
  });

  it('draws the bolt once per strike, not every frame', () => {
    const { lightning } = make();
    const bolt = lightning.root.children[1] as Graphics;
    const clear = vi.spyOn(bolt, 'clear');
    lightning.update(view, HORIZON, 1, strike, false);
    lightning.update(view, HORIZON, 0.8, strike, false);
    lightning.update(view, HORIZON, 0.5, strike, false);
    expect(clear).toHaveBeenCalledTimes(1);
    lightning.update(view, HORIZON, 1, { ...strike, time: 30 }, false);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('fades the bolt out with the flash', () => {
    const { lightning } = make();
    lightning.update(view, HORIZON, 1, strike, false);
    const bright = (lightning.root.children[1] as Graphics).alpha;
    lightning.update(view, HORIZON, 0.4, strike, false);
    expect((lightning.root.children[1] as Graphics).alpha).toBeLessThan(bright);
  });

  it('ends the flash (and dims the sky overlay) once the flash is over', () => {
    const { lightning } = make();
    lightning.update(view, HORIZON, 1, strike, false);
    lightning.update(view, HORIZON, 0.005, null, false);
    expect(lightning.root.visible).toBe(false);
    expect(lightning.flashLevel).toBeLessThan(0.01);
  });
});
