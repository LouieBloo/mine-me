import { MiningTileType, type FluidDefinition } from '@mine-me/shared';
import type { GeneratedFluidCell, ServerMiningGrid } from '../../miningMap.service';
import type { SandboxLayout, SandboxMobSpawn, TileRect } from './SandboxLayout';

export interface SandboxMap {
  grid: ServerMiningGrid;
  fluidCells: GeneratedFluidCell[];
  /** Mobs the map starts with, in map coordinates (the sky rows are already added to `y`). */
  mobs: readonly SandboxMobSpawn[];
  /** Row of the ground surface: where the sky ends. */
  surfaceRow: number;
}

/**
 * Builds the sandbox map from a layout. Every tile is revealed (no fog of war), so tiles, fluid and
 * fire reach every client through the normal wire format. Throws if a zone lies outside the map,
 * so a typo in a layout fails loudly instead of leaving a silent hole.
 */
export function buildSandboxMap(layout: SandboxLayout, fluids: readonly FluidDefinition[]): SandboxMap {
  const { width, skyRows } = layout;
  const height = layout.height + skyRows;
  // Open sky first, then the ground and everything below it
  const grid: ServerMiningGrid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, () => ({ type: y < skyRows ? MiningTileType.EMPTY : layout.base, revealed: true })),
  );
  const fluidCells: GeneratedFluidCell[] = [];
  const bySlot = [...fluids].sort((a, b) => (a.typeKey < b.typeKey ? -1 : a.typeKey > b.typeKey ? 1 : 0));

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
        zone.tiles.forEach((tile, i) => set(zone.startX + i * zone.spacing, zone.y, tile, 'block row'));
        break;
      case 'pool': {
        const fluid = bySlot[zone.fluidSlot];
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
  return { grid, fluidCells, mobs, surfaceRow: skyRows };
}
