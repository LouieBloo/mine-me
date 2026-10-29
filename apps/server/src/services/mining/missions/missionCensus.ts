import { missionShortfall, type MapCensus, type MissionRequirements, type MissionShortfall } from '@mine-me/shared';
import type { MiningTileType } from '@mine-me/shared';
import { blockKeyForTileType } from '../subsystems/MiningDataManager';

interface CensusSource {
  grid: ReadonlyArray<ReadonlyArray<{ type: MiningTileType }>>;
  fluidCells: ReadonlyArray<{ typeKey: string }>;
  gasCells?: ReadonlyArray<{ typeKey: string }>;
}

const countBy = (cells: ReadonlyArray<{ typeKey: string }>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c.typeKey, (counts.get(c.typeKey) ?? 0) + 1);
  return counts;
};

/** What a generated map holds, counted for the feasibility check. Mobs are spawned by the room, so none are counted here. */
export function censusOf(map: CensusSource, mobCounts: ReadonlyMap<string, number> = new Map()): MapCensus {
  const blockCounts = new Map<string, number>();
  for (const row of map.grid) {
    for (const tile of row) {
      const key = blockKeyForTileType(tile.type);
      if (key) blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
    }
  }
  return { blockCounts, mobCounts, fluidCells: countBy(map.fluidCells), gasCells: countBy(map.gasCells ?? []), depth: Math.max(0, map.grid.length - 1) };
}

/** What a generated map still lacks for the mission, apart from mobs (the room adds those when it fills the caves). */
export function mapShortfall(req: MissionRequirements, map: CensusSource): MissionShortfall[] {
  return missionShortfall({ ...req, mobs: [] }, censusOf(map));
}
