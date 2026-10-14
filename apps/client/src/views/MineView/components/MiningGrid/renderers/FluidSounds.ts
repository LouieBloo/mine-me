import {
  MINING_SPATIAL_AUDIO_PRESETS,
  type FireField,
  type FireWireCell,
  type MiningFluidSplashEvent,
} from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import type { SoundManager } from '../../../../../services/sound';
import type { FluidRenderer } from './FluidRenderer';

/** Most burning loops playing at once: the nearest fires get them, however big the fire is. */
export const MAX_BURN_LOOPS = 4;
/** Fewest milliseconds between two "catch fire" sounds, so a fire spreading fast crackles rather than machine-guns. */
export const IGNITE_SOUND_INTERVAL_MS = 120;
/** How often the burning loops are brought up to date. */
export const BURN_LOOP_SYNC_INTERVAL_MS = 250;

type Sounds = Pick<SoundManager, 'playPositionalSfx' | 'playLoopingSfx' | 'updateLoopingSfxPosition' | 'stopLoopingSfx'>;

interface ActiveLoop {
  url: string;
  cellKey: number;
}

/**
 * Plays what fluids and fire sound like. Every sound comes from the fluid's own sound slots (library sounds,
 * each with its own volume), so a fluid with no sounds is silent and nothing here names a fluid:
 *   - enter/exit: when the server says a player or mob crossed a fluid's surface (heard by everyone in range);
 *   - ignite: when a cell starts burning (one at a time, not faster than `IGNITE_SOUND_INTERVAL_MS`);
 *   - burn: a few positional loops on the burning cells nearest the player.
 */
export class FluidSounds {
  private readonly sound: Sounds;
  private readonly fluids: FluidRenderer;
  private readonly fire: FireField;
  private lastIgnite = -Infinity;
  private lastLoopSync = -Infinity;
  private readonly loops = new Map<number, ActiveLoop>();

  constructor(sound: Sounds, fluids: FluidRenderer, fire: FireField) {
    this.sound = sound;
    this.fluids = fluids;
    this.fire = fire;
  }

  public get activeLoops(): number {
    return this.loops.size;
  }

  /** Splash sounds for bodies that crossed a fluid's surface. */
  public onSplashes(events: readonly MiningFluidSplashEvent[]): void {
    for (const event of events) {
      const slot = this.fluids.soundsOf(event.fluidId)?.[event.kind];
      if (!slot?.url) continue;
      this.sound.playPositionalSfx(slot.url, { x: event.x, y: event.y }, withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.FLUID_SPLASH }));
    }
  }

  /** "Catch fire" sound for cells that just started burning (cells that only came into view do not count). */
  public onFireChanges(cells: readonly FireWireCell[], nowMs: number): void {
    if (nowMs - this.lastIgnite < IGNITE_SOUND_INTERVAL_MS) return;
    for (const [x, y, burning] of cells) {
      if (burning !== 1) continue;
      const slot = this.fluids.soundsOf(this.fluids.field.getFluidId(x, y))?.ignite;
      if (!slot?.url) continue;
      this.lastIgnite = nowMs;
      this.sound.playPositionalSfx(slot.url, { x: x + 0.5, y: y + 0.5 }, withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.FIRE_IGNITE }));
      return;
    }
  }

  /** Keeps up to `MAX_BURN_LOOPS` crackle loops on the burning cells nearest `focus` (a tile position), a few times a second. */
  public syncLoops(nowMs: number, focus: { x: number; y: number }): void {
    if (nowMs - this.lastLoopSync < BURN_LOOP_SYNC_INTERVAL_MS) return;
    this.lastLoopSync = nowMs;

    const candidates: Array<{ key: number; x: number; y: number; url: string; volume: number; distance: number }> = [];
    this.fire.forEachBurning((x, y) => {
      const slot = this.fluids.soundsOf(this.fluids.field.getFluidId(x, y))?.burn;
      if (!slot?.url) return;
      candidates.push({ key: y * this.fire.width + x, x, y, url: slot.url, volume: slot.volume ?? 1, distance: Math.hypot(x + 0.5 - focus.x, y + 0.5 - focus.y) });
    });
    candidates.sort((a, b) => a.distance - b.distance || a.key - b.key);
    const nearest = candidates.slice(0, MAX_BURN_LOOPS);

    // Each loop keeps the cell it already has while that cell is still among the nearest, so sounds do not jump about
    const claimed = new Set<number>();
    const next = new Map<number, ActiveLoop & { x: number; y: number; volume: number }>();
    const free: number[] = [];
    for (let slotIndex = 0; slotIndex < MAX_BURN_LOOPS; slotIndex++) {
      const current = this.loops.get(slotIndex);
      const keep = current && nearest.find((c) => c.key === current.cellKey && c.url === current.url);
      if (current && keep) {
        claimed.add(keep.key);
        next.set(slotIndex, { ...current, x: keep.x, y: keep.y, volume: keep.volume });
      } else {
        free.push(slotIndex);
      }
    }
    const unclaimed = nearest.filter((c) => !claimed.has(c.key));
    for (const slotIndex of free) {
      const cell = unclaimed.shift();
      if (cell) next.set(slotIndex, { url: cell.url, cellKey: cell.key, x: cell.x, y: cell.y, volume: cell.volume });
    }

    for (let slotIndex = 0; slotIndex < MAX_BURN_LOOPS; slotIndex++) {
      const key = `fluid_burn_${slotIndex}`;
      const before = this.loops.get(slotIndex);
      const after = next.get(slotIndex);
      if (!after) {
        if (before) this.sound.stopLoopingSfx(key);
        continue;
      }
      const position = { x: after.x + 0.5, y: after.y + 0.5 };
      if (before && before.url === after.url && before.cellKey === after.cellKey) {
        this.sound.updateLoopingSfxPosition(key, position, MINING_SPATIAL_AUDIO_PRESETS.FIRE_CRACKLE);
      } else {
        if (before) this.sound.stopLoopingSfx(key);
        this.sound.playLoopingSfx(key, after.url, withVolume(after.volume, { position, spatial: MINING_SPATIAL_AUDIO_PRESETS.FIRE_CRACKLE }));
      }
    }

    this.loops.clear();
    for (const [slotIndex, loop] of next) this.loops.set(slotIndex, { url: loop.url, cellKey: loop.cellKey });
  }

  /** Stops every loop. */
  public destroy(): void {
    for (const slotIndex of this.loops.keys()) this.sound.stopLoopingSfx(`fluid_burn_${slotIndex}`);
    this.loops.clear();
  }
}
