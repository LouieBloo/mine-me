/** Small colour helpers for the surface (sky gradients, tints, weather light). Colours are `0xRRGGBB` numbers or CSS hex strings. */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Whether the text is a CSS hex colour like #87ceeb. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** `#rrggbb` as a number; `fallback` for anything else. */
export function parseCssColor(value: string | null | undefined, fallback = 0xffffff): number {
  return isHexColor(value) ? parseInt(value.slice(1), 16) : fallback;
}

/** A number as `#rrggbb`. */
export function toHexColor(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Blends two colours: t = 0 is `a`, 1 is `b`. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k);
  const g = Math.round(((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k);
  const bl = Math.round((a & 0xff) * (1 - k) + (b & 0xff) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Multiplies two colours (like a tint on a picture). */
export function multiplyColors(a: number, b: number): number {
  const r = Math.round((((a >> 16) & 0xff) * ((b >> 16) & 0xff)) / 255);
  const g = Math.round((((a >> 8) & 0xff) * ((b >> 8) & 0xff)) / 255);
  const bl = Math.round(((a & 0xff) * (b & 0xff)) / 255);
  return (r << 16) | (g << 8) | bl;
}

/** The sky colour `t` of the way from its top (0) to the horizon (1), in `steps` bands. */
export function skyGradientColors(top: number, horizon: number, steps: number): number[] {
  const n = Math.max(1, Math.floor(steps));
  return Array.from({ length: n }, (_, i) => lerpColor(top, horizon, n === 1 ? 1 : i / (n - 1)));
}
