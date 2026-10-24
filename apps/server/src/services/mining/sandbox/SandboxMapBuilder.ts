import { BandBiomeField, BLOCK_SCALE, MiningTileType, type BiomeDefinition, type FluidDefinition, type GasDefinition } from '@mine-me/shared';
import { blockKeyForTileType, tileTypeForBlockKey } from '../subsystems/MiningDataManager';
import type { GeneratedFluidCell, GeneratedGasCell, ServerMiningGrid } from '../../miningMap.service';
import type { SandboxLayout, SandboxMobSpawn, TileRect } from './SandboxLayout';

export interface SandboxMap {
  grid: ServerMiningGrid;
  fluidCells: GeneratedFluidCell[];
  /** Gas the map starts with (sealed chambers), in map coordinates. */
  gasCells: GeneratedGasCell[];
  /** Mobs the map starts with, in map coordinates (the sky rows are already added to `y`). */
  mobs: readonly SandboxMobSpawn[];
  /** Row of the ground surface: where the sky ends. */
  surfaceRow: number;
  /** Which biome each cell is in: the biomes side by side in bands. Absent when there are no biomes besides the default. */
  biomeField?: BandBiomeField;
}

/** How wide the border between two biome bands is, in cells (4 original blocks). */
export const SANDBOX_BIOME_BLEND_CELLS = 4 * BLOCK_SCALE;

/** A fixed pseudo-random number in [0, 1) for a cell, so the sandbox looks the same every time it is built. */
function cellRoll(x: number, y: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ 0x5a9b10c5) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Builds the sandbox map from a layout. Every tile is revealed (no fog of war), so tiles, fluid and
 * fire reach every client through the normal wire format. Throws if a zone lies outside the map,
 * so a typo in a layout fails loudly instead of leaving a silent hole.
 */
export function buildSandboxMap(layout: SandboxLayout, fluids: readonly FluidDefinition[], gases: readonly GasDefinition[] = [], biomes: readonly BiomeDefinition[] = []): SandboxMap {
  const { width, skyRows } = layout;
  const height = layout.height + skyRows;
  // Open sky first, then the ground and everything below it
  const grid: ServerMiningGrid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, () => ({ type: y < skyRows ? MiningTileType.EMPTY : layout.base, revealed: true })),
  );
  // Biomes (ticket 142) stand side by side along the map. The ground is swapped the way the generator swaps it, before the zones
  // below are painted on top, so the hand-built parts (hall, pools, block patches) stay as drawn and only the earth around them changes.
  const biomeField = biomes.length > 0 ? new BandBiomeField(biomes, width, height, skyRows, SANDBOX_BIOME_BLEND_CELLS) : undefined;
  const baseKey = blockKeyForTileType(layout.base);
  if (biomeField?.hasBiomes && baseKey) {
    for (let y = skyRows; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let reached = 0;
        const roll = cellRoll(x, y);
        for (const { to, chance } of biomeField.swapChances(x, y, baseKey)) {
          reached += chance;
          if (roll >= reached) continue;
          const type = tileTypeForBlockKey(to);
          if (type !== undefined) grid[y][x] = { type, revealed: true };
          break;
        }
      }
    }
  }
  const fluidCells: GeneratedFluidCell[] = [];
  const gasCells: GeneratedGasCell[] = [];
  const byKey = <T extends { typeKey: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.typeKey < b.typeKey ? -1 : a.typeKey > b.typeKey ? 1 : 0));
  const gasBySlot = byKey(gases);

  // Layout coordinates are relative to the ground surface; `check` validates them, `row` converts to the grid
  const check = (x: number, y: number, what: string) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= layout.height) {
      throw new Error(`Sandbox layout: ${what} at (${x}, ${y}) is outside the ${width}x${layout.height} map.`);
    }
  };
  const set = (x: number, y: number, type: MiningTileType, what: string) => {
    check(x, y, what);
    grid[y + skyRows][x] = { type, revealed: true };
  };
  const eachInRect = (r: TileRect, what: string, visit: (x: number, y: number) => void) => {
    if (r.x1 < r.x0 || r.y1 < r.y0) throw new Error(`Sandbox layout: ${what} has an empty rectangle.`);
    check(r.x0, r.y0, what);
    check(r.x1, r.y1, what);
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) visit(x, y);
  };

  for (const zone of layout.zones) {
    switch (zone.kind) {
      case 'fill':
        eachInRect(zone.rect, 'fill', (x, y) => set(x, y, zone.tile, 'fill'));
        break;
      case 'tiles':
        for (const p of zone.at) set(p.x, p.y, zone.tile, 'tile');
        break;
      case 'blockRow':
        zone.tiles.forEach((tile, i) => {
          const size = zone.size ?? 1;
          for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) set(zone.startX + i * zone.spacing + dx, zone.y + dy, tile, 'block row');
        });
        break;
      case 'chamber': {
        const gas = gasBySlot[zone.gasSlot];
        eachInRect(zone.rect, 'chamber', (x, y) => {
          set(x, y, MiningTileType.EMPTY, 'chamber');
          if (gas) gasCells.push({ x, y: y + skyRows, typeKey: gas.typeKey, concentration: zone.concentration ?? 1 });
        });
        break;
      }
      case 'pool': {
        const fluid = fluids.find((f) => f.typeKey === zone.fluid);
        const fillFrom = zone.fillFromY ?? zone.rect.y0;
        eachInRect(zone.rect, 'pool', (x, y) => {
          set(x, y, MiningTileType.EMPTY, 'pool');
          if (fluid && y >= fillFrom) fluidCells.push({ x, y: y + skyRows, typeKey: fluid.typeKey, level: 1 });
        });
        break;
      }
    }
  }

  for (const mob of layout.mobs) check(Math.floor(mob.x), Math.floor(mob.y), 'mob');
  const mobs = layout.mobs.map((mob) => ({ ...mob, y: mob.y + skyRows }));
  return { grid, fluidCells, gasCells, mobs, surfaceRow: skyRows, biomeField: biomeField?.hasBiomes ? biomeField : undefined };
}
