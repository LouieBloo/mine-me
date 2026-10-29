import type { ObjectiveDefinition } from '../../types/mission';

/** How many times the need a map holds, so a mission is comfortably doable and not just barely. */
export const MISSION_SUPPLY_MARGIN = 2;
/** The fewest cells of a fluid or gas a clear objective makes the map hold (one small pocket), however small its amount. */
export const MISSION_MIN_POCKET_CELLS = 8;

/** What a map has to hold for a mission to be achievable (ticket 110). Pure data: the generator and the checker both read it. */
export interface MissionRequirements {
  /** Blocks that must be on the map, by block type key (e.g. 'COPPERIUM'), at least this many cells. */
  blocks: { typeKey: string; minCount: number }[];
  /** Mobs that must spawn: a mob id (null = any mob), at least this many. */
  mobs: { mobId: string | null; minSpawns: number }[];
  /** Fluids that must be on the map (by type key), at least this many cells. */
  fluids: { typeKey: string; minCells: number }[];
  /** Gases that must be on the map (by type key), at least this many cells. */
  gases: { typeKey: string; minCells: number }[];
  /** The map must reach at least this far below the surface, in small blocks (0 = no need). */
  minDepth: number;
}

export const NO_MISSION_REQUIREMENTS: Readonly<MissionRequirements> = { blocks: [], mobs: [], fluids: [], gases: [], minDepth: 0 };

/** What deriving needs from the content tables. */
export interface RequirementContext {
  /** Blocks that drop an item, with the expected quantity of it per block broken. */
  blocksDropping(itemId: string): { typeKey: string; expectedPerBlock: number }[];
  fluidTypeKey(fluidId: string): string | undefined;
  gasTypeKey(gasId: string): string | undefined;
}

/** Whether the requirements ask for anything at all. */
export function hasRequirements(req: MissionRequirements): boolean {
  return req.blocks.length > 0 || req.mobs.length > 0 || req.fluids.length > 0 || req.gases.length > 0 || req.minDepth > 0;
}

/** What the objectives need from the map. Objectives asking for the same thing add up. */
export function deriveMissionRequirements(objectives: readonly ObjectiveDefinition[], ctx: RequirementContext): MissionRequirements {
  const blocks = new Map<string, number>();
  const mobs = new Map<string | null, number>();
  const fluids = new Map<string, number>();
  const gases = new Map<string, number>();
  let minDepth = 0;

  for (const o of objectives) {
    if (o.type === 'MINE_ITEM' && o.targetId) {
      const best = [...ctx.blocksDropping(o.targetId)].sort((a, b) => b.expectedPerBlock - a.expectedPerBlock)[0];
      if (best && best.expectedPerBlock > 0) {
        blocks.set(best.typeKey, (blocks.get(best.typeKey) ?? 0) + Math.ceil((o.amount * MISSION_SUPPLY_MARGIN) / best.expectedPerBlock));
      }
    } else if (o.type === 'KILL_MOB') {
      const key = o.targetId || null;
      mobs.set(key, (mobs.get(key) ?? 0) + o.amount);
    } else if (o.type === 'CLEAR_FLUID' && o.targetId) {
      const key = ctx.fluidTypeKey(o.targetId);
      if (key) fluids.set(key, (fluids.get(key) ?? 0) + o.amount * MISSION_SUPPLY_MARGIN);
    } else if (o.type === 'CLEAR_GAS' && o.targetId) {
      const key = ctx.gasTypeKey(o.targetId);
      if (key) gases.set(key, (gases.get(key) ?? 0) + o.amount * MISSION_SUPPLY_MARGIN);
    } else if (o.type === 'REACH_DEPTH') {
      minDepth = Math.max(minDepth, o.amount);
    }
  }

  return {
    blocks: [...blocks].map(([typeKey, minCount]) => ({ typeKey, minCount })),
    mobs: [...mobs].map(([mobId, amount]) => ({ mobId, minSpawns: amount + Math.max(2, Math.ceil(amount / 2)) })),
    fluids: [...fluids].map(([typeKey, need]) => ({ typeKey, minCells: Math.max(MISSION_MIN_POCKET_CELLS, Math.ceil(need)) })),
    gases: [...gases].map(([typeKey, need]) => ({ typeKey, minCells: Math.max(MISSION_MIN_POCKET_CELLS, Math.ceil(need)) })),
    minDepth,
  };
}

/** What a finished map actually holds. */
export interface MapCensus {
  blockCounts: ReadonlyMap<string, number>;
  /** Mobs spawned, by mob id. */
  mobCounts: ReadonlyMap<string, number>;
  fluidCells: ReadonlyMap<string, number>;
  gasCells: ReadonlyMap<string, number>;
  /** Rows between the surface and the bottom of the map. */
  depth: number;
}

export interface MissionShortfall {
  kind: 'block' | 'mob' | 'fluid' | 'gas' | 'depth';
  /** Type key, mob id (empty for any mob) or empty for depth. */
  key: string;
  /** How many more are needed (cells, spawns or rows). */
  missing: number;
}

/** What the map lacks to satisfy the requirements (empty when it is achievable). The feasibility check of ticket 110. */
export function missionShortfall(req: MissionRequirements, census: MapCensus): MissionShortfall[] {
  const out: MissionShortfall[] = [];
  for (const b of req.blocks) {
    const have = census.blockCounts.get(b.typeKey) ?? 0;
    if (have < b.minCount) out.push({ kind: 'block', key: b.typeKey, missing: b.minCount - have });
  }
  const anyMobs = [...census.mobCounts.values()].reduce((sum, n) => sum + n, 0);
  for (const m of req.mobs) {
    const have = m.mobId === null ? anyMobs : census.mobCounts.get(m.mobId) ?? 0;
    if (have < m.minSpawns) out.push({ kind: 'mob', key: m.mobId ?? '', missing: m.minSpawns - have });
  }
  for (const f of req.fluids) {
    const have = census.fluidCells.get(f.typeKey) ?? 0;
    if (have < f.minCells) out.push({ kind: 'fluid', key: f.typeKey, missing: f.minCells - have });
  }
  for (const g of req.gases) {
    const have = census.gasCells.get(g.typeKey) ?? 0;
    if (have < g.minCells) out.push({ kind: 'gas', key: g.typeKey, missing: g.minCells - have });
  }
  if (req.minDepth > 0 && census.depth < req.minDepth) out.push({ kind: 'depth', key: '', missing: req.minDepth - census.depth });
  return out;
}

/** Cells of a fluid or gas gone since the start (never negative: new fluid added to the map does not undo progress). */
export function cellsCleared(start: number, now: number): number {
  if (!(start > 0)) return 0;
  return Math.max(0, start - now);
}
