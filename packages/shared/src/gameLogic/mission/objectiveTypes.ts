import type { MissionObjectiveView, ObjectiveDefinition, ObjectiveType } from '../../types/mission';

/** What the registry needs to know about the game's content to check and describe an objective. */
export interface MissionLookups {
  hasItem(id: string): boolean;
  hasMob(id: string): boolean;
  hasFluid(id: string): boolean;
  hasGas(id: string): boolean;
  /** The display name of an item, mob, fluid or gas (absent: the id is shown). */
  nameOf(kind: ObjectiveTargetKind, id: string): string | undefined;
  /** Whether some block drops the item (a MINE_ITEM needs one, or the map could never hold it). Absent: not checked. */
  itemIsMineable?(id: string): boolean;
  /** The deepest row below the surface the map reaches, in small blocks. Absent: not checked. */
  maxDepth?: number;
}

export type ObjectiveTargetKind = 'item' | 'mob' | 'fluid' | 'gas';

/**
 * One kind of objective. A new type is one entry in `OBJECTIVE_TYPES` (plus the event that feeds it in the tracker); missions
 * never carry per-type code. The admin builds its type list and target pickers from here.
 */
export interface ObjectiveTypeDefinition {
  type: ObjectiveType;
  /** Name in the admin's type list. */
  label: string;
  /** False for a type that is planned but cannot be saved or offered yet. */
  available: boolean;
  /** What `targetId` points at, if anything. */
  targetKind: ObjectiveTargetKind | null;
  /** Whether a target must be named (KILL_MOB may leave it empty: any mob). */
  targetRequired: boolean;
  /** How `amount` and progress are read. */
  unit: MissionObjectiveView['unit'];
  /** Smallest and largest amount. */
  minAmount: number;
  maxAmount: number;
  /** What `amount` means, for the admin's field label. */
  amountLabel: string;
}

export const OBJECTIVE_TYPES: Readonly<Record<ObjectiveType, ObjectiveTypeDefinition>> = {
  MINE_ITEM: { type: 'MINE_ITEM', label: 'Collect an item', available: true, targetKind: 'item', targetRequired: true, unit: 'count', minAmount: 1, maxAmount: 10000, amountLabel: 'Items to collect' },
  KILL_MOB: { type: 'KILL_MOB', label: 'Kill mobs', available: true, targetKind: 'mob', targetRequired: false, unit: 'count', minAmount: 1, maxAmount: 1000, amountLabel: 'Kills' },
  CLEAR_FLUID: { type: 'CLEAR_FLUID', label: 'Clear a fluid', available: true, targetKind: 'fluid', targetRequired: true, unit: 'count', minAmount: 1, maxAmount: 1000, amountLabel: 'Cells of the fluid to clear (a full cell = 1)' },
  CLEAR_GAS: { type: 'CLEAR_GAS', label: 'Clear a gas', available: true, targetKind: 'gas', targetRequired: true, unit: 'count', minAmount: 1, maxAmount: 1000, amountLabel: 'Cells of the gas to clear (a full cell = 1)' },
  REACH_DEPTH: { type: 'REACH_DEPTH', label: 'Reach a depth', available: true, targetKind: null, targetRequired: false, unit: 'depth', minAmount: 1, maxAmount: 100000, amountLabel: 'Depth below the surface (small blocks)' },
  PUMP_FLUID: { type: 'PUMP_FLUID', label: 'Pump out a fluid (not available yet)', available: false, targetKind: 'fluid', targetRequired: true, unit: 'count', minAmount: 1, maxAmount: 100000, amountLabel: 'Units to pump' },
};

/** The types an admin may pick today, in display order. */
export const AVAILABLE_OBJECTIVE_TYPES: readonly ObjectiveType[] = (Object.keys(OBJECTIVE_TYPES) as ObjectiveType[]).filter((t) => OBJECTIVE_TYPES[t].available);

export function isObjectiveType(value: unknown): value is ObjectiveType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OBJECTIVE_TYPES, value);
}

const hasTarget = (kind: ObjectiveTargetKind, id: string, lookups: MissionLookups): boolean =>
  kind === 'item' ? lookups.hasItem(id) : kind === 'mob' ? lookups.hasMob(id) : kind === 'fluid' ? lookups.hasFluid(id) : lookups.hasGas(id);

/** Problems with one objective, one message each (empty when it is valid). */
export function validateObjective(objective: Partial<ObjectiveDefinition> | null | undefined, lookups: MissionLookups): string[] {
  if (!objective || typeof objective !== 'object') return ['an objective is missing'];
  if (!isObjectiveType(objective.type)) return [`unknown objective type "${String(objective.type)}"`];
  const def = OBJECTIVE_TYPES[objective.type];
  const errors: string[] = [];
  if (!def.available) errors.push(`${def.label}: this objective type cannot be used yet`);
  const amount = objective.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount < def.minAmount || amount > def.maxAmount) {
    errors.push(`${def.label}: amount must be a whole number from ${def.minAmount} to ${def.maxAmount}`);
  }
  const target = objective.targetId;
  if (def.targetKind === null) {
    if (target) errors.push(`${def.label}: takes no target`);
  } else if (target === undefined || target === null || target === '') {
    if (def.targetRequired) errors.push(`${def.label}: choose a ${def.targetKind}`);
  } else if (typeof target !== 'string' || !hasTarget(def.targetKind, target, lookups)) {
    errors.push(`${def.label}: unknown ${def.targetKind} "${String(target)}"`);
  } else if (objective.type === 'MINE_ITEM' && lookups.itemIsMineable && !lookups.itemIsMineable(target)) {
    errors.push(`${def.label}: no block drops "${lookups.nameOf('item', target) ?? target}", so the map could not hold it`);
  }
  if (objective.type === 'REACH_DEPTH' && typeof amount === 'number' && lookups.maxDepth !== undefined && amount > lookups.maxDepth) {
    errors.push(`${def.label}: the map is only ${lookups.maxDepth} blocks deep`);
  }
  return errors;
}

/** "Collect 10 Copperium", "Clear 150 cells of the Water", "Reach depth 40": the objective as a player reads it. */
export function describeObjective(objective: ObjectiveDefinition, lookups: Pick<MissionLookups, 'nameOf'>): string {
  const target = objective.targetId ?? '';
  const name = (kind: ObjectiveTargetKind) => lookups.nameOf(kind, target) ?? target;
  switch (objective.type) {
    case 'MINE_ITEM':
      return `Collect ${objective.amount} ${name('item')}`;
    case 'KILL_MOB':
      return target ? `Kill ${objective.amount} ${name('mob')}` : `Kill ${objective.amount} ${objective.amount === 1 ? 'mob' : 'mobs'}`;
    case 'CLEAR_FLUID':
      return `Clear ${objective.amount} ${objective.amount === 1 ? 'cell' : 'cells'} of the ${name('fluid')}`;
    case 'CLEAR_GAS':
      return `Clear ${objective.amount} ${objective.amount === 1 ? 'cell' : 'cells'} of the ${name('gas')}`;
    case 'REACH_DEPTH':
      return `Reach depth ${objective.amount}`;
    case 'PUMP_FLUID':
      return `Pump out ${objective.amount} of the ${name('fluid')}`;
  }
}

/** Progress as text: "3 / 10", "45%" or "12 / 40". */
export function formatProgress(unit: MissionObjectiveView['unit'], progress: number, target: number): string {
  const shown = Math.max(0, Math.min(unit === 'percent' ? 100 : Number.POSITIVE_INFINITY, Math.floor(progress)));
  if (unit === 'percent') return `${shown}%`;
  return `${Math.min(shown, target)} / ${target}`;
}

/** Share (0 to 1) of an objective that is done, for a progress bar. */
export function progressFraction(progress: number, target: number): number {
  if (!(target > 0)) return 1;
  return Math.max(0, Math.min(1, progress / target));
}
