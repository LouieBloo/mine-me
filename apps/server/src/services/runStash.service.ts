import type { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { CharacterService } from './character.service';
import { InventoryService } from './inventory.service';

/** A stack of items. */
export interface StashItem {
  itemId: string;
  quantity: number;
}

const merge = (...lists: readonly StashItem[][]): Map<string, number> => {
  const merged = new Map<string, number>();
  for (const list of lists) {
    for (const { itemId, quantity } of list) {
      if (Number.isInteger(quantity) && quantity > 0) merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
    }
  }
  return merged;
};

/**
 * The run stash (ticket 121): what a player has handed to the extractor during a run. Each deposit is written to the
 * database as it lands, so a crash, a death or a timeout keeps it; when the run ends the stash is banked into the
 * inventory and its rows deleted in one transaction (`bank`), which is safe to call twice (the second time finds
 * nothing). Writes for one character run in order, and `bank` waits for any still in flight.
 */
export class RunStashService {
  private static readonly queues = new Map<string, Promise<unknown>>();

  private static enqueue<T>(characterId: string, work: () => Promise<T>): Promise<T> {
    const previous = RunStashService.queues.get(characterId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    RunStashService.queues.set(characterId, next);
    void next.catch(() => undefined).finally(() => {
      if (RunStashService.queues.get(characterId) === next) RunStashService.queues.delete(characterId);
    });
    return next;
  }

  /** Adds items to a character's stash (one transaction). Resolves when written; a failure is reported, not swallowed. */
  public static add(characterId: string, items: readonly StashItem[]): Promise<void> {
    const merged = merge([...items]);
    if (merged.size === 0) return Promise.resolve();
    return RunStashService.enqueue(characterId, async () => {
      await prisma.$transaction(
        [...merged].map(([itemId, quantity]) =>
          prisma.runStash.upsert({
            where: { characterId_itemId: { characterId, itemId } },
            create: { characterId, itemId, quantity },
            update: { quantity: { increment: quantity } },
          })
        )
      );
    });
  }

  /** What is in a character's stash right now (after any write still in flight). */
  public static list(characterId: string): Promise<StashItem[]> {
    return RunStashService.enqueue(characterId, async () => {
      const rows = await prisma.runStash.findMany({ where: { characterId } });
      return rows.filter((r) => r.quantity > 0).map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
    });
  }

  /**
   * Banks the stash and `extra` (the backpack, when the run ends at the exit) into the inventory in one
   * transaction, then empties the stash. Everything commits or nothing does, and calling it again banks nothing twice.
   * A `bonus` (a mission's reward, ticket 113) is written in the same transaction: Sol with the items, experience right after
   * it commits (like the experience items carry), so a failed payout leaves the stash, the backpack and the reward all unpaid.
   */
  public static bank(
    characterId: string,
    extra: readonly StashItem[] = [],
    bonus: { sol?: number; experience?: number } = {}
  ): Promise<{ banked: StashItem[]; stash: StashItem[]; skipped: { itemId: string; quantity: number; reason: string }[] }> {
    return RunStashService.enqueue(characterId, async () => {
      const skipped: { itemId: string; quantity: number; reason: string }[] = [];
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const rows = await tx.runStash.findMany({ where: { characterId } });
        const stash = rows.filter((r) => r.quantity > 0).map((r) => ({ itemId: r.itemId, quantity: r.quantity }));
        const applied = await InventoryService.applyGrantsInTransaction(tx, characterId, merge(stash, [...extra]), skipped);
        if ((bonus.sol ?? 0) > 0) await tx.character.update({ where: { id: characterId }, data: { sol: { increment: bonus.sol } } });
        await tx.runStash.deleteMany({ where: { characterId } });
        return { ...applied, stash };
      });
      const experience = result.experienceGranted + Math.max(0, bonus.experience ?? 0);
      if (experience > 0) await CharacterService.addExperience(characterId, experience);
      return { banked: result.granted, stash: result.stash, skipped };
    });
  }
}
