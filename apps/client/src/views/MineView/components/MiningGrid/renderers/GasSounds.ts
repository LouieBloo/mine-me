import {
  MINING_SPATIAL_AUDIO_PRESETS,
  type GasEvent,
  type GasExplosionCell,
  type GasSoundSlot,
} from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import type { SoundManager } from '../../../../../services/sound';
import type { GasRenderer } from './GasRenderer';

/** Fewest milliseconds between two "explode" sounds, so a front crossing a pocket booms rather than machine-guns. */
export const EXPLODE_SOUND_INTERVAL_MS = 150;

type Sounds = Pick<SoundManager, 'playPositionalSfx'>;

/** Which spatial falloff each gas sound uses. */
const SPATIAL: Record<GasSoundSlot, (typeof MINING_SPATIAL_AUDIO_PRESETS)[keyof typeof MINING_SPATIAL_AUDIO_PRESETS]> = {
  enter: MINING_SPATIAL_AUDIO_PRESETS.GAS_ENTER,
  exit: MINING_SPATIAL_AUDIO_PRESETS.GAS_ENTER,
  ignite: MINING_SPATIAL_AUDIO_PRESETS.GAS_IGNITE,
  explode: MINING_SPATIAL_AUDIO_PRESETS.GAS_EXPLOSION,
  vent: MINING_SPATIAL_AUDIO_PRESETS.GAS_VENT,
};

/**
 * Plays what gases sound like. Every sound comes from the gas's own sound slots (library sounds, each with its
 * own volume), so a gas with no sounds is silent and nothing here names a gas:
 *   - enter/exit: when the server says a player or mob walked into or out of a cloud (heard by everyone in range);
 *   - ignite: when explosive gas is set alight;
 *   - explode: as the front of an explosion passes through (one boom at a time, not faster than `EXPLODE_SOUND_INTERVAL_MS`);
 *   - vent: when gas starts escaping into the open air.
 */
export class GasSounds {
  private readonly sound: Sounds;
  private readonly gases: GasRenderer;
  private lastExplode = -Infinity;

  constructor(sound: Sounds, gases: GasRenderer) {
    this.sound = sound;
    this.gases = gases;
  }

  private play(slotKey: GasSoundSlot, gasId: number, position: { x: number; y: number }): void {
    const slot = this.gases.soundsOf(gasId)?.[slotKey];
    if (!slot?.url) return;
    this.sound.playPositionalSfx(slot.url, position, withVolume(slot.volume, { spatial: SPATIAL[slotKey] }));
  }

  /** Sounds for the events the server sent this tick. */
  public onEvents(events: readonly GasEvent[]): void {
    for (const event of events) this.play(event.kind, event.gasId, { x: event.x, y: event.y });
  }

  /** The boom of explosive gas going off: one sound for the batch of cells that detonated, from the middle of it. */
  public onExplosions(cells: readonly GasExplosionCell[], nowMs: number): void {
    if (cells.length === 0 || nowMs - this.lastExplode < EXPLODE_SOUND_INTERVAL_MS) return;
    const [x, y, gasId] = cells[Math.floor(cells.length / 2)];
    const slot = this.gases.soundsOf(gasId)?.explode;
    if (!slot?.url) return;
    this.lastExplode = nowMs;
    this.play('explode', gasId, { x: x + 0.5, y: y + 0.5 });
  }
}
