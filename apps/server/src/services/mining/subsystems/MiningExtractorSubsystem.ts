import {
  nextUnloadIndex,
  placeExtractor,
  type ExtractorDefinition,
  type ExtractorPlacement,
  type MiningExtractorClientState,
  type MiningExtractorUpdate,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';
import type { MiningPlayerSession } from './MiningPlayerManager';

/** How long the landing waits for a client to say it is ready before it begins anyway. */
export const EXTRACTOR_CLIENT_WAIT_SECONDS = 30;

/** The most sim seconds a deposit waits before it is written to the database. */
export const STASH_FLUSH_SECONDS = 1;

/** Writes deposits to the database; rejecting means they were not saved (they are kept and tried again). */
export type StashWriter = (characterId: string, items: { itemId: string; quantity: number }[]) => Promise<void> | void;

/**
 * The room's one extractor (tickets 119-125): the machine that flies in and lands on the surface when a run starts,
 * to the side of the exit (never on it). Everything about it comes from its `ExtractorDefinition`; this class owns
 * where it stands and whether it has landed. The belt (122) and the deposit zone (121) hang off it, and neither
 * works before it has landed.
 *
 * Landing runs on the sim clock from the moment the first player joins, so a player who joins later finds it landed.
 */
export class MiningExtractorSubsystem {
  public readonly definition: ExtractorDefinition;
  public readonly placement: ExtractorPlacement;
  /** Sim time at which it lands; null until the first player has joined. */
  private landsAt: number | null = null;
  private landedAnnounced = false;
  /** Sim time at which the landing begins by itself if no client has asked (see `expectClient`). */
  private beginDeadline: number | null = null;
  private pendingUpdate: MiningExtractorUpdate | undefined;
  /** Set by the room's owner (the session manager) in modes that save to the character. */
  public writeStash: StashWriter | null = null;

  constructor(private readonly world: MiningWorld) {
    this.definition = world.data.getDefaultExtractor();
    this.placement = placeExtractor(this.definition, world.surfaceRow, world.grid[0]?.length ?? 0);
  }

  /**
   * The landing waits for a client to say its screen is showing the mine (`begin` then), so the flight is seen and not played
   * behind the loading screen. If no client ever says so, it begins on its own after `maxWaitSeconds`.
   */
  public expectClient(maxWaitSeconds: number = EXTRACTOR_CLIENT_WAIT_SECONDS): void {
    if (this.landsAt === null && this.beginDeadline === null) this.beginDeadline = this.world.simTime + maxWaitSeconds;
  }

  /** Starts the landing clock (once; harmless to call again). */
  public begin(): void {
    if (this.landsAt === null) this.landsAt = this.world.simTime + this.definition.landingSeconds;
  }

  /** Lands it now (sandbox tool and test scenes: no waiting for the flight). */
  public skipLanding(): void {
    this.landsAt = this.world.simTime;
  }

  /** Whether the machine is down and working. Before the first player joins it has not started landing. */
  public isLanded(): boolean {
    return this.landsAt !== null && this.world.simTime >= this.landsAt;
  }

  /** Seconds of the landing still to go (0 once landed; the full length before it has begun). */
  public landingRemaining(): number {
    if (this.landsAt === null) return this.definition.landingSeconds;
    return Math.max(0, this.landsAt - this.world.simTime);
  }

  /** Once per tick: notices the moment the machine lands. */
  public update(): void {
    if (this.landsAt === null && this.beginDeadline !== null && this.world.simTime >= this.beginDeadline) this.begin();
    if (!this.landedAnnounced && this.isLanded()) {
      this.landedAnnounced = true;
      this.pendingUpdate = { landed: true };
    }
  }

  /** The change to tell clients about this tick, then forgets it. */
  public takeUpdate(): MiningExtractorUpdate | undefined {
    const update = this.pendingUpdate;
    this.pendingUpdate = undefined;
    return update;
  }

  /** The static description (and the landing progress right now) for a client joining the room. */
  public clientState(): MiningExtractorClientState {
    const def = this.definition;
    const { x, y, width, height } = this.placement;
    return {
      id: def.id,
      key: def.key,
      name: def.name,
      textureUrl: def.textureUrl ?? null,
      x,
      y,
      width,
      height,
      landingSeconds: def.landingSeconds,
      landingRemaining: this.landingRemaining(),
      landingEffect: this.world.data.getParticleEffect(def.landingParticleEffectId)?.config ?? null,
      sounds: def.sounds ?? null,
    };
  }

  /** Whether a body at (x, y) is at the extractor: standing in its footprint on the ground (a little above counts, for a jump). */
  public isInDepositZone(x: number, y: number): boolean {
    const { x: left, y: top, width } = this.placement;
    return x >= left && x <= left + width && y >= top - 1 && y <= this.world.surfaceRow + 1;
  }

  /**
   * Once per tick: a player standing at a landed extractor hands over their backpack at the deposit rate, heaviest
   * item first. Units move to their stash; the database write follows within `STASH_FLUSH_SECONDS` or as soon as
   * they stop (and always when the run ends), so a crash loses at most that moment of deposits.
   */
  public updateDeposits(dt: number): void {
    const landed = this.isLanded();
    const rate = this.definition.depositItemsPerSecond;
    for (const session of this.world.players.values()) {
      const depositing =
        landed && !session.isDead && session.temporaryBackpack.length > 0 && this.isInDepositZone(session.playerBody.position.x, session.playerBody.position.y);
      if (depositing) {
        session.depositCarry += rate * dt;
        const units = Math.floor(session.depositCarry);
        session.depositCarry -= units;
        if (units > 0) this.moveToStash(session, units);
      } else {
        session.depositCarry = 0;
      }
      const stillMoving = depositing && session.temporaryBackpack.length > 0;
      if (session.unsavedStash.size > 0 && (!stillMoving || this.world.simTime - session.unsavedStashSince >= STASH_FLUSH_SECONDS)) {
        this.flushStash(session);
      }
    }
  }

  /** Moves up to `units` units from the backpack to the stash, heaviest item first. */
  private moveToStash(session: MiningPlayerSession, units: number): void {
    const weightOf = (id: string) => this.world.data.getItemData(id);
    let left = units;
    while (left > 0) {
      const index = nextUnloadIndex(session.temporaryBackpack, weightOf);
      if (index < 0) break;
      const stack = session.temporaryBackpack[index];
      const moved = Math.min(left, stack.quantity);
      stack.quantity -= moved;
      left -= moved;
      if (stack.quantity <= 0) session.temporaryBackpack.splice(index, 1);
      this.addToStash(session, { itemId: stack.itemId, itemName: stack.itemName, iconUrl: stack.iconUrl }, moved);
    }
    session.backpackDirty = true;
  }

  /** Puts `quantity` of an item in a player's stash (it is written to the database shortly after, see `updateDeposits`). */
  public addToStash(session: MiningPlayerSession, item: { itemId: string; itemName: string; iconUrl: string | null }, quantity: number): void {
    const held = session.stash.find((s) => s.itemId === item.itemId);
    if (held) held.quantity += quantity;
    else session.stash.push({ ...item, quantity });
    if (session.unsavedStash.size === 0) session.unsavedStashSince = this.world.simTime;
    session.unsavedStash.set(item.itemId, (session.unsavedStash.get(item.itemId) ?? 0) + quantity);
    session.stashDirty = true;
  }

  /**
   * Something reached the extractor for a player who may since have left the room: it goes to their live stash if they
   * are here, otherwise straight to the database.
   */
  public creditStash(characterId: string, item: { itemId: string; itemName: string; iconUrl: string | null }, quantity: number): void {
    const session = this.world.players.get(characterId);
    if (session) {
      this.addToStash(session, item, quantity);
      return;
    }
    void Promise.resolve(this.writeStash?.(characterId, [{ itemId: item.itemId, quantity }])).catch((err) =>
      console.error(`[Mining] Could not save an item that reached the extractor for ${characterId}:`, err)
    );
  }

  /** Writes a player's unsaved deposits to the database now (or keeps them for the next try if the write fails). */
  public flushStash(session: MiningPlayerSession): void {
    if (session.unsavedStash.size === 0) return;
    const items = [...session.unsavedStash].map(([itemId, quantity]) => ({ itemId, quantity }));
    session.unsavedStash = new Map();
    if (!this.writeStash) return;
    const retry = (err: unknown) => {
      console.error(`[Mining] Could not save a deposit for ${session.characterId}; will try again:`, err);
      for (const { itemId, quantity } of items) session.unsavedStash.set(itemId, (session.unsavedStash.get(itemId) ?? 0) + quantity);
      session.unsavedStashSince = this.world.simTime;
    };
    try {
      const written = this.writeStash(session.characterId, items);
      if (written) void Promise.resolve(written).catch(retry);
    } catch (err) {
      retry(err);
    }
  }
}
