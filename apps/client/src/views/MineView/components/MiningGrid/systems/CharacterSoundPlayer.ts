import {
  MINING_SPATIAL_AUDIO_PRESETS,
  type CharacterSoundEffectsConfig,
  type CharacterSoundSlot,
  type MiningItemPickupEvent,
} from '@mine-me/shared';
import type { PlaySfxOptions } from '../../../../../services/sound/SoundManager';
import { withVolume } from '../../../../../services/sound/sfxVolume';

/** The part of the sound manager the character sounds need. */
export interface CharacterSoundOutput {
  playSfx(url: string, options?: PlaySfxOptions): unknown;
  preloadSfx?(urls: string[]): unknown;
}

/** The player's body, as seen once per rendered frame. */
export interface CharacterMotionFrame {
  isGrounded: boolean;
  isOnLadder: boolean;
  /** Vertical speed in tiles/s (positive is down). */
  velocityY: number;
  /** Seconds left in which the body is being carried by a knockback. */
  knockbackRemaining: number;
  /** The jump key is held. */
  jumpPressed: boolean;
}

/** A landing must be at least this fast (tiles/s) to be heard; a normal jump lands at ~8.5, a small hop or step is slower. */
export const LAND_SOUND_MIN_IMPACT_SPEED = 6;

/**
 * Plays the player character's sounds (hurt, jump, land, pickup, death). The sounds come from the server
 * with the run (`characterSounds`), so nothing here knows a file name; a slot with no sound stays
 * silent. Jump and land are worked out from how the body moves each frame.
 */
export class CharacterSoundPlayer {
  private previous: CharacterMotionFrame | null = null;
  private peakFallSpeed = 0;
  private readonly output: CharacterSoundOutput | null;
  private sounds: CharacterSoundEffectsConfig;

  constructor(output: CharacterSoundOutput | null, sounds: CharacterSoundEffectsConfig = {}) {
    this.output = output;
    this.sounds = sounds;
    this.preload();
  }

  /** Replaces the sounds (e.g. when the server sends new ones). */
  public setSounds(sounds: CharacterSoundEffectsConfig | undefined): void {
    this.sounds = sounds ?? {};
    this.preload();
  }

  /** Plays one slot, if it has a sound. */
  public play(slot: CharacterSoundSlot): void {
    const config = this.sounds[slot];
    if (!config?.url || !this.output) return;
    this.output.playSfx(config.url, config.volume !== undefined ? { volumeScale: config.volume } : undefined);
  }

  /** Pickup sounds, heard from where each player stood (full volume for the local player, fading with distance for others). */
  public onPickups(events: readonly MiningItemPickupEvent[]): void {
    const config = this.sounds.pickup;
    if (!config?.url || !this.output) return;
    for (const event of events) {
      this.output.playSfx(
        config.url,
        withVolume(config.volume, { position: { x: event.x, y: event.y }, spatial: MINING_SPATIAL_AUDIO_PRESETS.ITEM_PICKUP })
      );
    }
  }

  /** The player took damage: the killing blow plays the death sound instead of the hurt sound. */
  public onDamaged(healthAfter: number): void {
    this.play(healthAfter <= 0 ? 'death' : 'hurt');
  }

  /** Call once per rendered frame with the body's state; plays jump and land sounds on the changes. */
  public observeMotion(frame: CharacterMotionFrame): void {
    const prev = this.previous;
    this.previous = { ...frame };
    if (!prev) return;

    const airborne = !frame.isGrounded && !frame.isOnLadder;
    if (airborne && frame.velocityY > 0) this.peakFallSpeed = Math.max(this.peakFallSpeed, frame.velocityY);

    // Left the ground by their own jump (not by being knocked off or walking off a ledge)
    if (prev.isGrounded && !frame.isGrounded && frame.jumpPressed && frame.velocityY < 0 && frame.knockbackRemaining <= 0) {
      this.peakFallSpeed = 0;
      this.play('jump');
    }

    // Touched down hard enough to hear
    if (!prev.isGrounded && frame.isGrounded && !frame.isOnLadder) {
      if (this.peakFallSpeed >= LAND_SOUND_MIN_IMPACT_SPEED) this.play('land');
      this.peakFallSpeed = 0;
    } else if (frame.isOnLadder) {
      this.peakFallSpeed = 0;
    }
  }

  private preload(): void {
    const urls = Object.values(this.sounds).flatMap((slot) => (slot?.url ? [slot.url] : []));
    if (urls.length > 0) this.output?.preloadSfx?.(urls);
  }
}
