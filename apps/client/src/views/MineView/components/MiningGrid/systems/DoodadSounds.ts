import { MINING_SPATIAL_AUDIO_PRESETS, type DoodadEntry, type DoodadSoundSlotResolved } from '@mine-me/shared';
import { withVolume } from '../../../../../services/sound/sfxVolume';
import type { SoundManager } from '../../../../../services/sound';
import type { DoodadRenderer, DoodadViewInfo } from '../renderers/DoodadRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

/** Most ambient loops playing at once: the nearest doodads get them, however many there are on screen. */
export const MAX_DOODAD_LOOPS = 4;
/** Most doodads that make a one-off ambient sound in a row of syncs (a drip, a chirp). */
export const MAX_DOODAD_ONE_SHOTS_PER_SYNC = 2;
/** Shortest and longest wait between two one-off ambient sounds of one doodad, in seconds. */
export const DOODAD_ONE_SHOT_MIN_SECONDS = 3;
export const DOODAD_ONE_SHOT_MAX_SECONDS = 9;
/** How often the sounds are brought up to date, in milliseconds. */
export const DOODAD_SOUND_SYNC_MS = 250;
/** Fewest milliseconds between two break sounds, so a blast does not play a hundred at once. */
export const DOODAD_BREAK_INTERVAL_MS = 80;

type Sounds = Pick<SoundManager, 'playPositionalSfx' | 'playLoopingSfx' | 'updateLoopingSfxPosition' | 'stopLoopingSfx'>;

const keyOf = (entry: DoodadEntry): string => `${entry.x},${entry.y}`;

/** A fixed number in [0, 1) for a doodad and a count, so its waits between sounds are the same every time. */
function waitRoll(entry: DoodadEntry, n: number): number {
  let h = (Math.imul(entry.x, 0x27d4eb2d) ^ Math.imul(entry.y, 0x165667b1) ^ Math.imul(n + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Plays what doodads sound like (ticket 103), all from their own sound slots (library sounds, each with its own volume), played
 * with `withVolume` so the final level is the effects slider x the slot's volume x distance. Only doodads on screen make sound:
 *   - ambient, looping: a few positional loops on the nearest doodads that have one;
 *   - ambient, not looping: now and then (every few seconds, out of step), at most a couple at a time;
 *   - break: once, when a doodad loses its block.
 */
export class DoodadSounds {
  private readonly sound: Sounds;
  private readonly renderer: DoodadRenderer;
  private readonly tileSize: number;
  private lastSync = -Infinity;
  private lastBreak = -Infinity;
  private readonly loops = new Map<number, { cell: string; url: string }>();
  private readonly nextOneShot = new Map<string, { at: number; count: number }>();

  constructor(sound: Sounds, renderer: DoodadRenderer, tileSize: number = TILE_SIZE) {
    this.sound = sound;
    this.renderer = renderer;
    this.tileSize = tileSize;
    renderer.setRemovedListener((info) => this.onRemoved(info, performance.now()));
  }

  public get activeLoops(): number {
    return this.loops.size;
  }

  private static slot(entry: DoodadEntry, key: 'ambient' | 'react' | 'break'): DoodadSoundSlotResolved | undefined {
    const slot = entry.definition.sounds?.[key];
    return slot?.url ? slot : undefined;
  }

  private positionOf(info: DoodadViewInfo): { x: number; y: number } {
    return { x: info.anchorX / this.tileSize, y: info.anchorY / this.tileSize };
  }

  /** The break sound of a doodad that just lost its block. */
  public onRemoved(info: DoodadViewInfo, nowMs: number): void {
    if (nowMs - this.lastBreak < DOODAD_BREAK_INTERVAL_MS) return;
    const slot = DoodadSounds.slot(info.entry, 'break');
    if (!slot?.url) return;
    this.lastBreak = nowMs;
    this.sound.playPositionalSfx(slot.url, this.positionOf(info), withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.DOODAD }));
  }

  /** Keeps the ambient sounds going, a few times a second. `focus` is the player's position in tiles. */
  public sync(nowMs: number, focus: { x: number; y: number }): void {
    if (nowMs - this.lastSync < DOODAD_SOUND_SYNC_MS) return;
    this.lastSync = nowMs;
    const maxDistance = MINING_SPATIAL_AUDIO_PRESETS.DOODAD.maxDistance;
    const near = this.renderer
      .visible()
      .filter((info) => DoodadSounds.slot(info.entry, 'ambient'))
      .map((info) => ({ info, p: this.positionOf(info) }))
      .map((c) => ({ ...c, distance: Math.hypot(c.p.x - focus.x, c.p.y - focus.y) }))
      .filter((c) => c.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance || (keyOf(a.info.entry) < keyOf(b.info.entry) ? -1 : 1));
    this.syncLoops(near.filter((c) => DoodadSounds.slot(c.info.entry, 'ambient')!.loop === true));
    this.playOneShots(
      near.filter((c) => DoodadSounds.slot(c.info.entry, 'ambient')!.loop !== true),
      nowMs
    );
  }

  private syncLoops(candidates: ReadonlyArray<{ info: DoodadViewInfo; p: { x: number; y: number } }>): void {
    const nearest = candidates.slice(0, MAX_DOODAD_LOOPS).map((c) => ({ cell: keyOf(c.info.entry), url: DoodadSounds.slot(c.info.entry, 'ambient')!.url!, ...c }));
    const claimed = new Set<string>();
    const next = new Map<number, (typeof nearest)[number]>();
    const free: number[] = [];
    for (let i = 0; i < MAX_DOODAD_LOOPS; i++) {
      const current = this.loops.get(i);
      const keep = current && nearest.find((c) => c.cell === current.cell && c.url === current.url);
      if (current && keep) {
        claimed.add(keep.cell);
        next.set(i, keep);
      } else {
        free.push(i);
      }
    }
    const unclaimed = nearest.filter((c) => !claimed.has(c.cell));
    for (const i of free) {
      const c = unclaimed.shift();
      if (c) next.set(i, c);
    }
    for (let i = 0; i < MAX_DOODAD_LOOPS; i++) {
      const id = `doodad_loop_${i}`;
      const before = this.loops.get(i);
      const after = next.get(i);
      if (!after) {
        if (before) this.sound.stopLoopingSfx(id);
        continue;
      }
      if (before && before.cell === after.cell && before.url === after.url) {
        this.sound.updateLoopingSfxPosition(id, after.p, MINING_SPATIAL_AUDIO_PRESETS.DOODAD);
      } else {
        if (before) this.sound.stopLoopingSfx(id);
        const slot = DoodadSounds.slot(after.info.entry, 'ambient')!;
        this.sound.playLoopingSfx(id, after.url, withVolume(slot.volume, { position: after.p, spatial: MINING_SPATIAL_AUDIO_PRESETS.DOODAD }));
      }
    }
    this.loops.clear();
    for (const [i, c] of next) this.loops.set(i, { cell: c.cell, url: c.url });
  }

  private playOneShots(candidates: ReadonlyArray<{ info: DoodadViewInfo; p: { x: number; y: number } }>, nowMs: number): void {
    const seen = new Set<string>();
    let played = 0;
    for (const { info, p } of candidates) {
      const key = keyOf(info.entry);
      seen.add(key);
      let state = this.nextOneShot.get(key);
      if (!state) {
        // The first sound comes after a wait of its own, so a field of doodads that just came into view does not all speak at once
        state = { at: nowMs + this.waitMs(info.entry, 0), count: 0 };
        this.nextOneShot.set(key, state);
      }
      if (nowMs < state.at || played >= MAX_DOODAD_ONE_SHOTS_PER_SYNC) continue;
      const slot = DoodadSounds.slot(info.entry, 'ambient')!;
      this.sound.playPositionalSfx(slot.url!, p, withVolume(slot.volume, { spatial: MINING_SPATIAL_AUDIO_PRESETS.DOODAD }));
      played++;
      state.count++;
      state.at = nowMs + this.waitMs(info.entry, state.count);
    }
    // Doodads that left the screen start fresh when they come back
    for (const key of this.nextOneShot.keys()) if (!seen.has(key)) this.nextOneShot.delete(key);
  }

  private waitMs(entry: DoodadEntry, n: number): number {
    const span = DOODAD_ONE_SHOT_MAX_SECONDS - DOODAD_ONE_SHOT_MIN_SECONDS;
    return (DOODAD_ONE_SHOT_MIN_SECONDS + waitRoll(entry, n) * span) * 1000;
  }

  /** Stops every loop. */
  public destroy(): void {
    for (const i of this.loops.keys()) this.sound.stopLoopingSfx(`doodad_loop_${i}`);
    this.loops.clear();
    this.nextOneShot.clear();
    this.renderer.setRemovedListener(null);
  }
}
