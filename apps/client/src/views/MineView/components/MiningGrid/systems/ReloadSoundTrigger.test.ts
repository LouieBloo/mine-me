import { describe, it, expect, vi } from 'vitest';
import { ReloadSoundTrigger } from './ReloadSoundTrigger';

const weapon = (reloadTime = 1.5, url: string | null = '/assets/sounds/items/reload.mp3', volume?: number): any => ({
  id: 'gun',
  projectileConfig: { reloadTime },
  soundEffects: url ? { reload: { url, ...(volume !== undefined && { volume }) } } : {},
});

const make = () => {
  let t = 1000;
  const trigger = new ReloadSoundTrigger(() => t);
  return { trigger, advance: (ms: number) => { t += ms; } };
};

describe('ReloadSoundTrigger', () => {
  it('plays the weapon reload slot', () => {
    const { trigger } = make();
    const play = vi.fn();
    expect(trigger.trigger(weapon(), play)).toBe(true);
    expect(play).toHaveBeenCalledWith('/assets/sounds/items/reload.mp3', 1);
  });

  it('plays the reload sound at the volume set on the weapon\'s reload slot', () => {
    const { trigger } = make();
    const play = vi.fn();
    trigger.trigger(weapon(1.5, '/assets/sounds/items/reload.mp3', 0.4), play);
    expect(play).toHaveBeenCalledWith('/assets/sounds/items/reload.mp3', 0.4);
  });

  it('is silent for a weapon with no reload sound or no weapon', () => {
    const { trigger } = make();
    const play = vi.fn();
    expect(trigger.trigger(weapon(1.5, null), play)).toBe(false);
    expect(trigger.trigger(null, play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('sounds a reload once even when the key press and the server tick both report it', () => {
    const { trigger, advance } = make();
    const play = vi.fn();
    trigger.trigger(weapon(), play); // R pressed
    advance(200);
    trigger.observeAmmo(false, weapon(), play);
    trigger.observeAmmo(true, weapon(), play); // server confirms the reload started
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays a reload the server started on its own (last round fired)', () => {
    const { trigger } = make();
    const play = vi.fn();
    trigger.observeAmmo(false, weapon(), play); // baseline
    expect(trigger.observeAmmo(true, weapon(), play)).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    trigger.observeAmmo(true, weapon(), play); // still reloading: no repeat
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays again for the next reload after the first one finished', () => {
    const { trigger, advance } = make();
    const play = vi.fn();
    trigger.observeAmmo(false, weapon(), play);
    trigger.observeAmmo(true, weapon(), play);
    advance(1600);
    trigger.observeAmmo(false, weapon(), play);
    advance(500);
    trigger.observeAmmo(true, weapon(), play);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not sound a reload that was already under way when the run started', () => {
    const { trigger } = make();
    const play = vi.fn();
    trigger.observeAmmo(true, weapon(), play);
    expect(play).not.toHaveBeenCalled();
  });
});
