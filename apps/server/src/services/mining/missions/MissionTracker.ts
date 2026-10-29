import {
  OBJECTIVE_TYPES,
  describeObjective,
  cellsCleared,
  type MissionClientState,
  type MissionDefinition,
  type MissionLookups,
  type MissionObjectiveView,
  type MissionProgressDelta,
  type MissionResultView,
  type MissionRewardView,
  type ObjectiveDefinition,
} from '@mine-me/shared';

/** How the tracker reads the room it watches. Everything is a function so the tracker stays pure and testable. */
export interface MissionTrackerDeps {
  lookups: Pick<MissionLookups, 'nameOf'>;
  /** Fluid and gas type keys (the grids are keyed by them). */
  fluidTypeKey(fluidId: string): string | undefined;
  gasTypeKey(gasId: string): string | undefined;
  /** What is in the room right now, in cells of fluid / units of gas. */
  fluidTotal(typeKey: string): number;
  gasTotal(typeKey: string): number;
  /** The deepest row below the surface the map reaches; a depth goal is never asked beyond it. */
  mapDepth: number;
  playerName(characterId: string): string;
  reward: MissionRewardView;
}

interface TrackedObjective {
  def: ObjectiveDefinition;
  /** The goal in the objective's unit (a depth is held within the map). */
  target: number;
  progress: number;
  done: boolean;
  label: string;
  /** Fluid / gas objectives: the amount on the map at the start (never changes after). */
  startTotal: number;
  /** Credit per player, for the results screen. */
  contributions: Map<string, number>;
}

/**
 * Follows a mission through a run (ticket 109): turns pickups, kills, depth and the fluid and gas totals into objective
 * progress, shared by the whole team with a record of who did what. Pure: the room tells it what happened (`onItemCollected`,
 * `onMobKilled`, `onDepth`, `poll`) and asks what changed (`takeDelta`); it never reads the room itself.
 *
 * Objectives can be added mid-run (`addObjective`) so encounters can hand out goals later. Completion is never undone, and
 * a reward can be claimed once per player (`claim`).
 */
export class MissionTracker {
  public readonly mission: MissionDefinition;
  private objectives: TrackedObjective[] = [];
  private changed = new Set<number>();
  private completedAnnounced = false;
  private readonly paid = new Set<string>();
  /** The mission's overall completion, latched the moment the last objective is done. */
  public completed = false;

  constructor(mission: MissionDefinition, private readonly deps: MissionTrackerDeps) {
    this.mission = mission;
    for (const def of mission.objectives) this.objectives.push(this.track(def));
    this.refreshCompletion();
  }

  private track(def: ObjectiveDefinition): TrackedObjective {
    let startTotal = 0;
    if (def.type === 'CLEAR_FLUID' && def.targetId) startTotal = this.deps.fluidTotal(this.deps.fluidTypeKey(def.targetId) ?? '');
    if (def.type === 'CLEAR_GAS' && def.targetId) startTotal = this.deps.gasTotal(this.deps.gasTypeKey(def.targetId) ?? '');
    // A depth is held within the map, and a clear goal within what the map actually holds (the generator keeps a margin, so this is a safety net)
    const target =
      def.type === 'REACH_DEPTH' ? Math.max(1, Math.min(def.amount, this.deps.mapDepth - 2))
      : (def.type === 'CLEAR_FLUID' || def.type === 'CLEAR_GAS') && startTotal > 0 ? Math.max(1, Math.min(def.amount, Math.floor(startTotal)))
      : def.amount;
    // A fluid or gas objective on a map that has none to clear cannot be failed by it: it counts as done at the start
    const nothingToClear = (def.type === 'CLEAR_FLUID' || def.type === 'CLEAR_GAS') && !(startTotal > 0);
    return {
      def,
      target,
      progress: nothingToClear ? target : 0,
      done: nothingToClear,
      label: describeObjective(target !== def.amount ? { ...def, amount: target } : def, this.deps.lookups),
      startTotal,
      contributions: new Map(),
    };
  }

  /** Adds an objective to a run in progress (any source: an encounter, a scene). Returns its index. */
  public addObjective(def: ObjectiveDefinition): number {
    this.objectives.push(this.track(def));
    const index = this.objectives.length - 1;
    this.changed.add(index);
    this.completed = false;
    this.completedAnnounced = false;
    this.refreshCompletion();
    return index;
  }

  public get objectiveCount(): number {
    return this.objectives.length;
  }

  private credit(o: TrackedObjective, characterId: string, amount: number): void {
    o.contributions.set(characterId, (o.contributions.get(characterId) ?? 0) + amount);
  }

  private advance(index: number, o: TrackedObjective, progress: number): void {
    if (o.done || progress <= o.progress) return;
    o.progress = progress;
    if (o.progress >= o.target) o.done = true;
    this.changed.add(index);
  }

  private refreshCompletion(): void {
    if (!this.completed && this.objectives.length > 0 && this.objectives.every((o) => o.done)) this.completed = true;
  }

  /** Items that went into a player's backpack (not blocks broken, not what is left on the ground). */
  public onItemCollected(characterId: string, itemId: string, quantity: number): void {
    if (!(quantity > 0)) return;
    this.objectives.forEach((o, i) => {
      if (o.def.type !== 'MINE_ITEM' || o.def.targetId !== itemId || o.done) return;
      const counted = Math.min(quantity, o.target - o.progress);
      this.credit(o, characterId, counted);
      this.advance(i, o, o.progress + quantity);
    });
    this.refreshCompletion();
  }

  /**
   * A mob died. Every kill in the run counts toward the objective (co-op; fire, falls, rocks and gas included). The player it is
   * credited to (see the damage system) gets the contribution on the results screen; `null` counts the kill for the run only.
   */
  public onMobKilled(characterId: string | null, mobId: string): void {
    this.objectives.forEach((o, i) => {
      if (o.def.type !== 'KILL_MOB' || o.done) return;
      if (o.def.targetId && o.def.targetId !== mobId) return;
      if (characterId) this.credit(o, characterId, 1);
      this.advance(i, o, o.progress + 1);
    });
    this.refreshCompletion();
  }

  /** How far below the surface a player is, in small blocks. Only the deepest counts. */
  public onDepth(characterId: string, depth: number): void {
    this.objectives.forEach((o, i) => {
      if (o.def.type !== 'REACH_DEPTH' || o.done) return;
      if (depth > (o.contributions.get(characterId) ?? 0)) o.contributions.set(characterId, Math.floor(depth));
      this.advance(i, o, depth);
    });
    this.refreshCompletion();
  }

  /** Re-reads the fluid and gas totals (a few times a second is plenty). */
  public poll(): void {
    this.objectives.forEach((o, i) => {
      if (o.done || o.startTotal <= 0) return;
      if (o.def.type === 'CLEAR_FLUID') {
        const now = this.deps.fluidTotal(this.deps.fluidTypeKey(o.def.targetId ?? '') ?? '');
        this.advance(i, o, Math.min(o.target, Math.floor(cellsCleared(o.startTotal, now) * 10) / 10));
      } else if (o.def.type === 'CLEAR_GAS') {
        const now = this.deps.gasTotal(this.deps.gasTypeKey(o.def.targetId ?? '') ?? '');
        this.advance(i, o, Math.min(o.target, Math.floor(cellsCleared(o.startTotal, now) * 10) / 10));
      }
    });
    this.refreshCompletion();
  }

  /** Completes every objective at once (the sandbox's force-complete button). */
  public forceComplete(): void {
    this.objectives.forEach((o, i) => {
      if (o.done) return;
      o.progress = o.target;
      o.done = true;
      this.changed.add(i);
    });
    this.refreshCompletion();
  }

  /** Progress changed since the last call, as the small delta the clients are sent; null when nothing moved. */
  public takeDelta(): MissionProgressDelta | null {
    const justCompleted = this.completed && !this.completedAnnounced;
    if (this.changed.size === 0 && !justCompleted) return null;
    const delta: MissionProgressDelta = {
      objectives: [...this.changed].sort((a, b) => a - b).map((index) => ({ index, progress: this.shown(this.objectives[index]), done: this.objectives[index].done })),
    };
    if (justCompleted) {
      delta.completed = true;
      this.completedAnnounced = true;
    }
    this.changed.clear();
    return delta;
  }

  private shown(o: TrackedObjective): number {
    return Math.floor(Math.min(o.progress, o.target));
  }

  /** Whether this player has already been paid. */
  public isPaid(characterId: string): boolean {
    return this.paid.has(characterId);
  }

  /**
   * Marks a player's reward as paid and says whether they should be: only a completed mission, and only once per player.
   * Call it when the safe exit is being banked, never before.
   */
  public claim(characterId: string): boolean {
    if (!this.completed || this.paid.has(characterId)) return false;
    this.paid.add(characterId);
    return true;
  }

  /** Takes a claim back (the payment failed and nothing was written), so the player can claim again. */
  public unclaim(characterId: string): void {
    this.paid.delete(characterId);
  }

  private views(): MissionObjectiveView[] {
    return this.objectives.map((o) => ({
      type: o.def.type,
      label: o.label,
      target: o.target,
      progress: this.shown(o),
      done: o.done,
      unit: OBJECTIVE_TYPES[o.def.type].unit,
    }));
  }

  /** The whole mission with its progress, for the start of a run and for a player who joins later. */
  public clientState(): MissionClientState {
    return {
      id: this.mission.id,
      name: this.mission.name,
      description: this.mission.description ?? null,
      tier: this.mission.tier,
      objectives: this.views(),
      reward: this.deps.reward,
      completed: this.completed,
      sounds: this.mission.sounds ?? null,
    };
  }

  /** How the run went for the mission, for the results screen and the end-of-run events. */
  public result(characterIds: readonly string[], outcome: MissionResultView['outcome'], reason?: string): MissionResultView {
    const known = new Set<string>(characterIds);
    for (const o of this.objectives) for (const id of o.contributions.keys()) known.add(id);
    return {
      name: this.mission.name,
      tier: this.mission.tier,
      outcome,
      objectives: this.views(),
      contributions: [...known].map((characterId) => ({
        characterId,
        characterName: this.deps.playerName(characterId),
        amounts: this.objectives.map((o) => Math.floor(o.contributions.get(characterId) ?? 0)),
      })),
      ...(reason ? { reason } : {}),
    };
  }
}
