import type { DoodadMotion } from '../../types/doodad';

/**
 * Procedural motion for doodads (ticket 103): a still picture moved by small formulas, so no spritesheets are needed.
 * A preset is a pure function of time, so a doodad's pose is the same on every client and testable without a screen.
 * Adding a preset is one entry in `DOODAD_MOTION_PRESETS`; nothing else names one.
 *
 * Offsets (`x`, `y`) are fractions of the drawn size of the whole doodad (its width and height), so they hold for any art size.
 * Rotation is in radians and turns about the doodad's anchor point (or a part's pivot).
 */

/** How a doodad (or one part of it) is posed at a moment. The identity pose is "stand still". */
export interface DoodadPose {
  rotation: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /**
   * `drip` only: how far a falling drop has fallen, 0 to 1 (eased, so it speeds up), or -1 while no drop is falling.
   * On a part named `drop` the pose's own `y` and `alpha` carry the same fall.
   */
  drop: number;
}

export const IDENTITY_DOODAD_POSE: Readonly<DoodadPose> = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1, drop: -1 };

/** What a preset reads besides the time. */
export interface DoodadMotionInput {
  /** Cycles since the start, with the doodad's phase added (so it is already out of step with its neighbours). */
  cycle: number;
  /** The motion's amplitude, or the preset's own default. */
  amplitude: number;
  params: Readonly<Record<string, number>>;
  /** How much of the motion this part gets (1 for the doodad as a whole). Set per part with a `weight_<partName>` param. */
  weight: number;
  /** The part being posed, or null for the doodad as a whole. */
  part: string | null;
}

export interface DoodadMotionPreset {
  name: string;
  label: string;
  description: string;
  /** Cycles per second when the motion gives none. */
  defaultSpeed: number;
  defaultAmplitude: number;
  evaluate(input: DoodadMotionInput): Partial<DoodadPose>;
}

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The part a drip's drop is drawn on. */
export const DRIP_DROP_PART = 'drop';
/** The share of a drip cycle the drop spends falling (the rest it waits to form), unless `fallShare` says otherwise. */
export const DEFAULT_DRIP_FALL_SHARE = 0.4;

/** Where in its cycle a drip is, 0 to 1 over the fall and -1 while it waits. */
export function dripProgress(cycle: number, params: Readonly<Record<string, number>> = {}): number {
  const fallShare = clamp01(params.fallShare ?? DEFAULT_DRIP_FALL_SHARE) || DEFAULT_DRIP_FALL_SHARE;
  const within = cycle - Math.floor(cycle);
  const waitShare = 1 - fallShare;
  if (within < waitShare) return -1;
  const t = (within - waitShare) / fallShare;
  return t * t;
}

export const DOODAD_MOTION_PRESETS: Readonly<Record<string, DoodadMotionPreset>> = {
  sway: {
    name: 'sway',
    label: 'Sway',
    description: 'Leans back and forth about the base, like grass or a mushroom stem in a draught. Weight a part with weight_<name> to keep it planted.',
    defaultSpeed: 0.4,
    defaultAmplitude: 0.08,
    evaluate: ({ cycle, amplitude, weight }) => ({
      rotation: weight * amplitude * ((Math.sin(cycle * TAU) + 0.35 * Math.sin(cycle * TAU * 2.3 + 1.3)) / 1.35),
    }),
  },
  pulse: {
    name: 'pulse',
    label: 'Pulse',
    description: 'Swells and glows, then relaxes. A doodad light follows it as a pulsing light.',
    defaultSpeed: 0.6,
    defaultAmplitude: 0.06,
    evaluate: ({ cycle, amplitude, weight }) => {
      const wave = 0.5 + 0.5 * Math.sin(cycle * TAU);
      const scale = 1 + weight * amplitude * (2 * wave - 1);
      return { scaleX: scale, scaleY: scale, alpha: clamp01(1 - weight * amplitude * 3 * (1 - wave)) };
    },
  },
  bob: {
    name: 'bob',
    label: 'Bob',
    description: 'Floats gently up and down (a spore, a bug hovering).',
    defaultSpeed: 0.5,
    defaultAmplitude: 0.06,
    evaluate: ({ cycle, amplitude, weight }) => ({ y: weight * amplitude * Math.sin(cycle * TAU) }),
  },
  drip: {
    name: 'drip',
    label: 'Drip',
    description: 'A drop forms, falls from the doodad and starts again. Put it on a part named "drop"; without parts the placeholder draws the drop and a particle effect splashes where it lands.',
    defaultSpeed: 0.25,
    defaultAmplitude: 1,
    evaluate: ({ cycle, amplitude, params, part }) => {
      const progress = dripProgress(cycle, params);
      if (part === null) return { drop: progress };
      if (part !== DRIP_DROP_PART) return {};
      // The drop grows while it waits, then falls the full height (times the amplitude) and fades as it lands
      if (progress < 0) {
        const within = cycle - Math.floor(cycle);
        const fallShare = clamp01(params.fallShare ?? DEFAULT_DRIP_FALL_SHARE) || DEFAULT_DRIP_FALL_SHARE;
        const grow = clamp01(within / (1 - fallShare));
        return { scaleX: grow, scaleY: grow, y: 0, alpha: grow, drop: progress };
      }
      return { y: progress * amplitude, alpha: clamp01(1 - progress * progress), drop: progress };
    },
  },
  flicker: {
    name: 'flicker',
    label: 'Flicker',
    description: 'Brightness stutters like a bad bulb or a flame. A doodad light follows it as a flickering light.',
    defaultSpeed: 2.5,
    defaultAmplitude: 0.25,
    evaluate: ({ cycle, amplitude, weight }) => {
      const noise = 0.5 * Math.sin(cycle * TAU) + 0.3 * Math.sin(cycle * TAU * 2.3 + 1.2) + 0.2 * Math.sin(cycle * TAU * 4.7 + 2.4);
      const dip = weight * amplitude * (0.5 - 0.5 * noise);
      return { alpha: clamp01(1 - dip), scaleX: 1 - dip * 0.1, scaleY: 1 - dip * 0.1 };
    },
  },
};

export const DOODAD_MOTION_PRESET_NAMES: readonly string[] = Object.keys(DOODAD_MOTION_PRESETS);

export const isDoodadMotionPreset = (name: unknown): name is string => typeof name === 'string' && Object.prototype.hasOwnProperty.call(DOODAD_MOTION_PRESETS, name);

/** A fixed phase in [0, 1) for a placed doodad, from its cell, so a field of them is out of step and every client agrees. */
export function doodadPhase(x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ 0x0d00da5) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The cycle a motion is at: `timeSeconds` at its speed, started at the motion's own phase or, absent, the placed doodad's. */
export function doodadCycle(motion: DoodadMotion, timeSeconds: number, placedPhase: number): number {
  const preset = DOODAD_MOTION_PRESETS[motion.preset];
  const speed = motion.speed ?? preset?.defaultSpeed ?? 0;
  return timeSeconds * speed + (motion.phase ?? placedPhase);
}

/**
 * The pose of a doodad (`partName` omitted) or of one of its parts at a time. A doodad with no motion, or one whose preset is
 * unknown (an old row), stands still.
 */
export function evaluateDoodadMotion(motion: DoodadMotion | null | undefined, timeSeconds: number, placedPhase: number, partName: string | null = null): DoodadPose {
  const preset = motion ? DOODAD_MOTION_PRESETS[motion.preset] : undefined;
  if (!motion || !preset) return { ...IDENTITY_DOODAD_POSE };
  const params = motion.params ?? {};
  const weight = partName === null ? 1 : (params[`weight_${partName}`] ?? 1);
  const pose = preset.evaluate({
    cycle: doodadCycle(motion, timeSeconds, placedPhase),
    amplitude: motion.amplitude ?? preset.defaultAmplitude,
    params,
    weight,
    part: partName,
  });
  return { ...IDENTITY_DOODAD_POSE, ...pose };
}

/**
 * Whether a drip's drop landed between two times (the moment its fall ends, so a splash can play there). Only `drip` lands anything.
 */
export function dripLandedBetween(motion: DoodadMotion | null | undefined, fromSeconds: number, toSeconds: number, placedPhase: number): boolean {
  if (!motion || motion.preset !== 'drip' || toSeconds <= fromSeconds) return false;
  // The fall ends where the cycle wraps to the next whole number
  return Math.floor(doodadCycle(motion, toSeconds, placedPhase)) > Math.floor(doodadCycle(motion, fromSeconds, placedPhase));
}

/**
 * The light a doodad gives off. A doodad whose motion is `pulse` or `flicker` and whose light has no effect of its own gives
 * a pulsing or flickering light at the motion's speed, so the light follows the picture without the lighting having to know
 * about doodads. Null when it has no light or the light is off.
 */
export function doodadLightConfig<L extends { enabled: boolean; effect: string; pulseSpeed?: number; flickerSpeed?: number }>(
  light: L | null | undefined,
  motion: DoodadMotion | null | undefined
): L | null {
  if (!light || light.enabled === false) return null;
  if (light.effect !== 'STATIC' || !motion) return light;
  if (motion.preset === 'pulse') return { ...light, effect: 'PULSE', pulseSpeed: (motion.speed ?? DOODAD_MOTION_PRESETS.pulse.defaultSpeed) * TAU };
  if (motion.preset === 'flicker') return { ...light, effect: 'FLICKER', flickerSpeed: (motion.speed ?? DOODAD_MOTION_PRESETS.flicker.defaultSpeed) * TAU };
  return light;
}
