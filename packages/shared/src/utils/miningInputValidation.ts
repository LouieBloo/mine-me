import type { MiningInputState, MiningPosition, Vector2D } from '../types/mining';

const MAX_TILE_COORD = 1_000_000;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates an untrusted tile coordinate. Tiles must be finite integers; range checks
 * against the actual grid are the caller's responsibility (see `isInBounds`).
 */
export function sanitizeTilePosition(raw: unknown): MiningPosition | null {
  if (!isPlainObject(raw)) return null;
  const { x, y } = raw;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (Math.abs(x) > MAX_TILE_COORD || Math.abs(y) > MAX_TILE_COORD) return null;
  return { x, y };
}

/** Validates an untrusted world-space point (e.g. a throw/shoot target). */
export function sanitizeWorldPoint(raw: unknown): Vector2D | null {
  if (!isPlainObject(raw)) return null;
  const { x, y } = raw;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > MAX_TILE_COORD || Math.abs(y) > MAX_TILE_COORD) return null;
  return { x, y };
}

function readBoolean(obj: Record<string, unknown>, key: string, required: boolean): boolean | undefined | null {
  const v = obj[key];
  if (v === undefined) return required ? false : undefined;
  return typeof v === 'boolean' ? v : null;
}

/**
 * Validates an untrusted `MiningInputState`. Returns `null` when the payload is malformed
 * so callers can keep the previously accepted input. Only whitelisted fields are copied.
 * A zero-length aim vector is dropped (not an error); otherwise aim is normalised.
 */
export function sanitizeMiningInput(raw: unknown): MiningInputState | null {
  if (!isPlainObject(raw)) return null;

  const up = readBoolean(raw, 'up', true);
  const down = readBoolean(raw, 'down', true);
  const left = readBoolean(raw, 'left', true);
  const right = readBoolean(raw, 'right', true);
  const miningKey = readBoolean(raw, 'miningKey', true);
  const jump = readBoolean(raw, 'jump', false);
  const isFacingLeft = readBoolean(raw, 'isFacingLeft', false);
  const flashlightOn = readBoolean(raw, 'flashlightOn', false);
  if ([up, down, left, right, miningKey, jump, isFacingLeft, flashlightOn].some((v) => v === null)) {
    return null;
  }

  let sequence = 0;
  if (raw.sequence !== undefined) {
    const s = raw.sequence;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > MAX_SEQUENCE) return null;
    sequence = s;
  }

  const out: MiningInputState = {
    up: up as boolean,
    down: down as boolean,
    left: left as boolean,
    right: right as boolean,
    miningKey: miningKey as boolean,
    sequence,
  };
  if (jump !== undefined) out.jump = jump as boolean;
  if (isFacingLeft !== undefined) out.isFacingLeft = isFacingLeft as boolean;
  if (flashlightOn !== undefined) out.flashlightOn = flashlightOn as boolean;

  if (raw.miningTarget !== undefined && raw.miningTarget !== null) {
    const target = sanitizeTilePosition(raw.miningTarget);
    if (!target) return null;
    out.miningTarget = target;
  } else if (raw.miningTarget === null) {
    out.miningTarget = null;
  }

  if (raw.aimDirection !== undefined) {
    const aim = sanitizeWorldPoint(raw.aimDirection);
    if (!aim) return null;
    const len = Math.hypot(aim.x, aim.y);
    if (len > 0.001) {
      out.aimDirection = { x: aim.x / len, y: aim.y / len };
    }
  }

  return out;
}
