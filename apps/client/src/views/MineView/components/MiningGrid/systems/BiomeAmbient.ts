import type { BiomeClientDefinition, MiningClientTile } from '@mine-me/shared';

/** How far around the player (in cells) the biome is read from. */
export const BIOME_SAMPLE_RADIUS = 14;
/** How often the surroundings are read, in seconds (the easing between reads runs every frame). */
const SAMPLE_INTERVAL = 0.25;
/** How fast the look catches up with the target, per second: about 95% of the way after one second. */
const EASE_RATE = 3;
/** The wall tint that changes nothing (colours multiply). */
export const NO_TINT = 0xffffff;

/** What the biomes around a spot add up to. */
export interface BlendedAmbient {
  /** The wall tint (0xffffff = no tint). */
  tint: number;
}

/** Where the ambient look is drawn. The system tells these only when something actually changed. */
export interface BiomeAmbientTargets {
  setTint(color: number): void;
  /** How much of each biome's own wall texture to show, per biome index (0 to 1). */
  setWallAlphas?(alphas: readonly number[]): void;
}

/** What the debug overlay reads. */
export interface BiomeDebugInfo {
  names: string[];
  shares: number[];
  /** The biome of the cell under the cursor, when it is known (revealed). */
  cursor: { x: number; y: number; biome: string | null } | null;
}

const parseColor = (hex: string | null | undefined): number => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return NO_TINT;
  return parseInt(hex.slice(1), 16);
};

/**
 * Which biomes the revealed cells around (cx, cy) are in, as shares that add up to 1 (nearer cells count more).
 * Null when no revealed cell there carries a biome (nothing to go on yet).
 */
export function sampleBiomeShares(
  grid: readonly (readonly MiningClientTile[])[],
  cx: number,
  cy: number,
  radius: number,
  biomeCount: number
): number[] | null {
  const totals = new Array<number>(biomeCount).fill(0);
  let sum = 0;
  for (let y = Math.floor(cy) - radius; y <= Math.floor(cy) + radius; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = Math.floor(cx) - radius; x <= Math.floor(cx) + radius; x++) {
      const tile = row[x];
      if (!tile?.revealed || tile.biome === undefined || tile.biome >= biomeCount) continue;
      const weight = 1 - Math.hypot(x - cx, y - cy) / (radius + 1);
      if (weight <= 0) continue;
      totals[tile.biome] += weight;
      sum += weight;
    }
  }
  return sum > 0 ? totals.map((t) => t / sum) : null;
}

/** The tint the biomes add up to at the given shares: each biome's own colour, weighted by its share. */
export function blendBiomeAmbient(biomes: readonly BiomeClientDefinition[], shares: readonly number[]): BlendedAmbient {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < biomes.length; i++) {
    const share = shares[i] ?? 0;
    if (share <= 0) continue;
    const tint = parseColor(biomes[i].ambient.tint);
    r += share * ((tint >> 16) & 0xff);
    g += share * ((tint >> 8) & 0xff);
    b += share * (tint & 0xff);
    total += share;
  }
  if (total <= 0) return { tint: NO_TINT };
  return { tint: (Math.round(r / total) << 16) | (Math.round(g / total) << 8) | Math.round(b / total) };
}

/**
 * The mine's ambient look follows the biome the player is in (ticket 097): the background wall tint and the biome
 * wall textures blend between biomes as the player moves, easing over about a second.
 * It reads the biome tags of the revealed cells around the player, so it never learns about cells the fog still hides.
 */
export class BiomeAmbient {
  private readonly biomes: readonly BiomeClientDefinition[];
  private readonly targets: BiomeAmbientTargets;
  private readonly current: number[];
  private target: number[] | null = null;
  private sinceSample = SAMPLE_INTERVAL;
  private applied: { tint: number; alphas: string } | null = null;
  private cursorInfo: BiomeDebugInfo['cursor'] = null;

  constructor(biomes: readonly BiomeClientDefinition[], targets: BiomeAmbientTargets) {
    this.biomes = biomes;
    this.targets = targets;
    this.current = new Array<number>(biomes.length).fill(0);
  }

  /** The current share of each biome (what is drawn right now). */
  public shares(): readonly number[] {
    return this.current;
  }

  /** Reads the surroundings now and then, and eases what is drawn towards them. Call every frame. */
  public update(
    dt: number,
    position: { x: number; y: number },
    grid: readonly (readonly MiningClientTile[])[],
    cursor?: { x: number; y: number } | null
  ): void {
    this.sinceSample += dt;
    if (this.sinceSample >= SAMPLE_INTERVAL) {
      this.sinceSample = 0;
      const sampled = sampleBiomeShares(grid, position.x, position.y, BIOME_SAMPLE_RADIUS, this.biomes.length);
      if (sampled) {
        if (!this.target) this.current.splice(0, this.current.length, ...sampled); // the first read is taken as it is
        this.target = sampled;
      }
    }
    if (cursor !== undefined) this.cursorInfo = this.describeCursor(grid, cursor);
    if (!this.target) return;

    const step = 1 - Math.exp(-EASE_RATE * dt);
    for (let i = 0; i < this.current.length; i++) this.current[i] += (this.target[i] - this.current[i]) * step;
    this.apply();
  }

  /** Draws the current look again (a texture that was still loading is ready now). */
  public reapply(): void {
    this.applied = null;
    if (this.target) this.apply();
  }

  /** Numbers for the debug overlay. */
  public debugInfo(): BiomeDebugInfo {
    return { names: this.biomes.map((b) => b.name), shares: [...this.current], cursor: this.cursorInfo };
  }

  private describeCursor(grid: readonly (readonly MiningClientTile[])[], cursor: { x: number; y: number } | null): BiomeDebugInfo['cursor'] {
    if (!cursor) return null;
    const tile = grid[Math.floor(cursor.y)]?.[Math.floor(cursor.x)];
    const biome = tile?.revealed && tile.biome !== undefined ? this.biomes[tile.biome]?.name ?? null : null;
    return { x: Math.floor(cursor.x), y: Math.floor(cursor.y), biome };
  }

  private apply(): void {
    const { tint } = blendBiomeAmbient(this.biomes, this.current);
    if (!this.applied || this.applied.tint !== tint) this.targets.setTint(tint);
    const alphas = this.current.map((s) => Math.round(s * 100) / 100);
    const key = alphas.join(',');
    if (this.targets.setWallAlphas && (!this.applied || this.applied.alphas !== key)) this.targets.setWallAlphas(alphas);
    this.applied = {
      tint,
      alphas: key,
    };
  }
}
