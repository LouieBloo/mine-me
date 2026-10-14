/** '#rrggbb' to a colour number (black if it cannot be read). */
export function parseHexColor(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  return match ? parseInt(match[1], 16) : 0x000000;
}

/** The colour lightened toward white by `amount` (0-1), for the highlight on a fluid's surface. */
export function lightenColor(color: number, amount: number): number {
  const channel = (shift: number) => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (255 - c) * amount);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The colour darkened toward black by `amount` (0-1), for fluid deep below the surface. */
export function darkenColor(color: number, amount: number): number {
  const keep = 1 - Math.min(1, Math.max(0, amount));
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * keep);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** A colour number as a CSS `rgba(...)` string (for canvas drawing). */
export function colorToCss(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}
