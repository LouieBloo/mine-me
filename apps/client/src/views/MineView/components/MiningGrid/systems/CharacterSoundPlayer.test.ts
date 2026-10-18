import { describe, it, expect, vi } from 'vitest';
import {
  CharacterSoundPlayer,
  LAND_SOUND_MIN_IMPACT_SPEED,
  type CharacterMotionFrame,
} from './CharacterSoundPlayer';

const sounds = {
  hurt: { url: '/assets/sounds/hurt.mp3', volume: 0.5 },
  jump: { url: '/assets/sounds/jump.mp3' },
  land: { url: '/assets/sounds/land.mp3' },
  death: { url: '/assets/sounds/death.mp3' },
};

const frame = (over: Partial<CharacterMotionFrame> = {}): CharacterMotionFrame => ({
  isGrounded: true, isOnLadder: false, velocityY: 0, knockbackRemaining: 0, jumpPressed: false, ...over,
});

const setup = (config: any = sounds) => {
  const output = { playSfx: vi.fn(), preloadSfx: vi.fn() };
  const player = new CharacterSoundPlayer(output, config);
  const played = () => output.playSfx.mock.calls.map((c) => c[0]);
  return { output, player, played };
};

describe('CharacterSoundPlayer', () => {
  it('plays a slot with its library volume, and nothing for an empty slot', () => {
    const { player, output, played } = setup({ hurt: sounds.hurt });
    player.play('hurt');
    player.play('jump');
    expect(output.playSfx).toHaveBeenCalledTimes(1);
    expect(output.playSfx).toHaveBeenCalledWith('/assets/sounds/hurt.mp3', { volumeScale: 0.5 });
    expect(played()).toEqual(['/assets/sounds/hurt.mp3']);
  });

  describe('pickup', () => {
    it('plays at each pickup position with the slot volume and a distance falloff', () => {
      const { player, output } = setup({ pickup: { url: '/assets/sounds/pickup.mp3', volume: 0.4 } });
      player.onPickups([{ x: 3, y: 4 }, { x: 9, y: 1 }]);
      expect(output.playSfx).toHaveBeenCalledTimes(2);
      expect(output.playSfx).toHaveBeenNthCalledWith(1, '/assets/sounds/pickup.mp3', expect.objectContaining({
        volumeScale: 0.4, position: { x: 3, y: 4 }, spatial: expect.objectContaining({ maxDistance: expect.any(Number) }),
      }));
    });

    it('is silent when the slot has no sound', () => {
      const { player, output } = setup({ hurt: sounds.hurt });
      player.onPickups([{ x: 1, y: 1 }]);
      expect(output.playSfx).not.toHaveBeenCalled();
    });
  });

  it('preloads every configured sound', () => {
    const { output } = setup();
    expect(output.preloadSfx).toHaveBeenCalledWith([
      '/assets/sounds/hurt.mp3', '/assets/sounds/jump.mp3', '/assets/sounds/land.mp3', '/assets/sounds/death.mp3',
    ]);
  });

  it('is silent without a sound output or without sounds', () => {
    const none = new CharacterSoundPlayer(null, sounds);
    expect(() => none.play('hurt')).not.toThrow();
    const { player, output } = setup({});
    player.onDamaged(10);
    expect(output.playSfx).not.toHaveBeenCalled();
    expect(output.preloadSfx).not.toHaveBeenCalled();
  });

  describe('damage', () => {
    it('plays hurt when the player survives and death on the killing blow', () => {
      const { player, played } = setup();
      player.onDamaged(40);
      player.onDamaged(0);
      expect(played()).toEqual(['/assets/sounds/hurt.mp3', '/assets/sounds/death.mp3']);
    });
  });

  describe('jump', () => {
    it('plays when the player leaves the ground by jumping', () => {
      const { player, played } = setup();
      player.observeMotion(frame());
      player.observeMotion(frame({ isGrounded: false, velocityY: -8, jumpPressed: true }));
      expect(played()).toEqual(['/assets/sounds/jump.mp3']);
    });

    it('does not play when walking off a ledge or being knocked into the air', () => {
      const { player, played } = setup();
      player.observeMotion(frame());
      player.observeMotion(frame({ isGrounded: false, velocityY: 0.3 }));
      player.observeMotion(frame());
      player.observeMotion(frame({ isGrounded: false, velocityY: -5, jumpPressed: true, knockbackRemaining: 0.2 }));
      expect(played()).toEqual([]);
    });

    it('plays once per jump, not every frame in the air', () => {
      const { player, played } = setup();
      player.observeMotion(frame());
      for (let i = 0; i < 10; i++) player.observeMotion(frame({ isGrounded: false, velocityY: -8 + i, jumpPressed: true }));
      expect(played()).toEqual(['/assets/sounds/jump.mp3']);
    });
  });

  describe('land', () => {
    const fall = (player: CharacterSoundPlayer, speed: number) => {
      player.observeMotion(frame());
      player.observeMotion(frame({ isGrounded: false, velocityY: 1 }));
      player.observeMotion(frame({ isGrounded: false, velocityY: speed }));
      player.observeMotion(frame()); // landed: the body's speed is already 0
    };

    it('plays when touching down at speed', () => {
      const { player, played } = setup();
      fall(player, LAND_SOUND_MIN_IMPACT_SPEED + 4);
      expect(played()).toEqual(['/assets/sounds/land.mp3']);
    });

    it('stays quiet for a tiny hop or a one-step drop', () => {
      const { player, played } = setup();
      fall(player, LAND_SOUND_MIN_IMPACT_SPEED - 1);
      expect(played()).toEqual([]);
    });

    it('does not play when stepping off a ladder, and forgets the speed from before', () => {
      const { player, played } = setup();
      player.observeMotion(frame({ isGrounded: false, velocityY: LAND_SOUND_MIN_IMPACT_SPEED + 5 }));
      player.observeMotion(frame({ isGrounded: false, isOnLadder: true, velocityY: 2 }));
      player.observeMotion(frame({ isGrounded: true }));
      expect(played()).toEqual([]);
    });

    it('plays one land sound per landing and a second one for the next fall', () => {
      const { player, played } = setup();
      fall(player, LAND_SOUND_MIN_IMPACT_SPEED + 2);
      fall(player, LAND_SOUND_MIN_IMPACT_SPEED + 4);
      expect(played()).toEqual(['/assets/sounds/land.mp3', '/assets/sounds/land.mp3']);
    });

    it('the first observed frame never plays anything (no previous state to compare)', () => {
      const { player, played } = setup();
      player.observeMotion(frame({ isGrounded: false, velocityY: 20, jumpPressed: true }));
      expect(played()).toEqual([]);
    });
  });
});
