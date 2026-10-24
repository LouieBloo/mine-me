import { MiningTileType, type BiomeAmbient } from '@mine-me/shared';

/** The colour each block is drawn with in the preview (a flat swatch is enough to read the layout). */
const TILE_COLORS: Partial<Record<MiningTileType, string>> = {
  [MiningTileType.EMPTY]: '#120b07',
  [MiningTileType.DIRT]: '#6b4a2f',
  [MiningTileType.ROCK]: '#8d8d93',
  [MiningTileType.COPPERIUM]: '#d9803a',
  [MiningTileType.SILVERIUM]: '#d6e4ee',
  [MiningTileType.LAVAROCK]: '#b3401f',
  [MiningTileType.BRIDGE]: '#a67c52',
  [MiningTileType.STONE]: '#57534e',
  [MiningTileType.CLAY]: '#9a5b3c',
  [MiningTileType.SANDSTONE]: '#c2a26a',
  [MiningTileType.GRAVEL]: '#8a8a8a',
  [MiningTileType.ICE]: '#9ed8ee',
  [MiningTileType.BEDROCK]: '#1c1c22',
};

const FALLBACK_TILE_COLOR = '#ff00ff';

/** The swatch for a tile type. */
export const tileColor = (type: number): string => TILE_COLORS[type as MiningTileType] ?? FALLBACK_TILE_COLOR;

/** Distinct hues for telling biomes apart when a biome sets no tint. */
const BIOME_HUES = [30, 205, 130, 285, 0, 175, 55, 330];

/** The colour that marks a biome in the preview: its own tint when it has one, otherwise a hue picked by its position. */
export function biomeColor(index: number, ambient?: BiomeAmbient | null): string {
  if (ambient?.tint && /^#[0-9a-fA-F]{6}$/.test(ambient.tint)) return ambient.tint;
  return `hsl(${BIOME_HUES[index % BIOME_HUES.length]} 65% 55%)`;
}

/** What a preview answer looks like (see the server's biome preview). */
export interface BiomePreviewResult {
  width: number;
  height: number;
  biomes: { index: number; key: string; name: string; ambient: BiomeAmbient }[];
  /** Row-major tile types. */
  tiles: number[];
  /** Row-major primary biome index per cell. */
  biomeIndex: number[];
  fluidCells: { x: number; y: number; typeKey: string }[];
  gasCells: { x: number; y: number; typeKey: string }[];
}

export type PreviewMode = 'blocks' | 'biomes';

/** How many cells of each biome the preview shows, as shares of the whole strip. */
export function biomeShares(result: BiomePreviewResult): { key: string; name: string; share: number }[] {
  const counts = new Array<number>(result.biomes.length).fill(0);
  for (const index of result.biomeIndex) if (index < counts.length) counts[index]++;
  const total = result.biomeIndex.length || 1;
  return result.biomes.map((b, i) => ({ key: b.key, name: b.name, share: counts[i] / total }));
}

/**
 * Paints the preview. `blocks` draws what the generator made, with a faint wash of each cell's biome colour so the regions
 * still read; `biomes` draws the regions alone, to judge their size and blending.
 */
export function drawBiomePreview(ctx: CanvasRenderingContext2D, result: BiomePreviewResult, mode: PreviewMode, cell: number): void {
  const { width, height } = result;
  ctx.clearRect(0, 0, width * cell, height * cell);
  const colors = result.biomes.map((b) => biomeColor(b.index, b.ambient));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const biome = colors[result.biomeIndex[i]] ?? '#000000';
      if (mode === 'biomes') {
        ctx.fillStyle = biome;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      } else {
        ctx.fillStyle = tileColor(result.tiles[i]);
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = biome;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.globalAlpha = 1;
      }
    }
  }
  if (mode === 'blocks') {
    ctx.fillStyle = 'rgba(40, 120, 255, 0.85)';
    for (const f of result.fluidCells) ctx.fillRect(f.x * cell, f.y * cell, cell, cell);
    ctx.fillStyle = 'rgba(200, 240, 255, 0.7)';
    for (const g of result.gasCells) ctx.fillRect(g.x * cell, g.y * cell, cell, cell);
  }
}
