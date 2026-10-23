import { MINING_SPATIAL_AUDIO_PRESETS, type ExtractorSoundEffectsConfig, type MiningBeltItem } from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import type { SoundManager } from '../../../../../services/sound';

type Sounds = Pick<SoundManager, 'playPositionalSfx' | 'playLoopingSfx' | 'stopLoopingSfx'>;

const LOOP_KEY = 'extractor_loop';

/**
 * What the extractor and its belt sound like. Every sound is one of the extractor's own sound slots (library sounds, each
 * with its own volume), so an extractor with none is silent and nothing here names a file:
 *   - unload: a sound where each item goes onto the belt (heard by players in range);
 *   - loop: a running loop at the machine while there is something on the belt.
 */
export class ExtractorSounds {
  private readonly sound: Sounds;
  private readonly sounds: ExtractorSoundEffectsConfig;
  private readonly machine: { x: number; y: number };
  private looping = false;

  constructor(sound: Sounds, sounds: ExtractorSoundEffectsConfig | null | undefined, machinePosition: { x: number; y: number }) {
    this.sound = sound;
    this.sounds = sounds ?? {};
    this.machine = machinePosition;
  }

  public get isLooping(): boolean {
    return this.looping;
  }

  /** Items went onto the belt: one sound for each, at the spot it went on. */
  public onItemsAdded(items: readonly MiningBeltItem[], position: (item: MiningBeltItem) => { x: number; y: number }): void {
    const slot = this.sounds.unload;
    if (!slot?.url) return;
    for (const item of items) {
      this.sound.playPositionalSfx(slot.url, position(item), withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.EXTRACTOR }));
    }
  }

  /** A belt segment broke: the break sound where it was, for each. */
  public onBeltBroke(positions: readonly { x: number; y: number }[]): void {
    const slot = this.sounds.beltBreak;
    if (!slot?.url) return;
    for (const position of positions) {
      this.sound.playPositionalSfx(slot.url, position, withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.EXTRACTOR }));
    }
  }

  /** Keeps the running loop going while `active` (something is on the belt), and stops it when not. */
  public syncLoop(active: boolean): void {
    const slot = this.sounds.loop;
    if (!slot?.url) return;
    if (active && !this.looping) {
      this.sound.playLoopingSfx(LOOP_KEY, slot.url, withVolume(slot.volume, { position: this.machine, spatial: MINING_SPATIAL_AUDIO_PRESETS.EXTRACTOR }));
      this.looping = true;
    } else if (!active && this.looping) {
      this.sound.stopLoopingSfx(LOOP_KEY);
      this.looping = false;
    }
  }

  public destroy(): void {
    if (this.looping) this.sound.stopLoopingSfx(LOOP_KEY);
    this.looping = false;
  }
}
