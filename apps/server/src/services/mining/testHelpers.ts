import { vi } from 'vitest';
import { MINING_CONFIG, knockbackAway, type DamageEvent, type DamageResult, type MiningTileType, type Vector2D } from '@mine-me/shared';
import type { MiningGameEngine } from './MiningGameEngine';

/** Test helper: hit a mob through the damage pipeline. */
export function hitMob(
  engine: MiningGameEngine,
  mobId: string,
  amount: number,
  extra: Partial<DamageEvent> = {}
): DamageResult {
  return engine.applyDamage(
    { kind: 'mob', id: mobId },
    { amount, type: 'melee', source: { kind: 'environment' }, ...extra }
  );
}

/**
 * Test helper: hit a player the way a mob attack does. If the source has a position the player is
 * knocked away from it. Returns whether the hit landed.
 */
export function hitPlayer(
  engine: MiningGameEngine,
  characterId: string,
  amount: number,
  source?: { id?: string; name?: string; position?: Vector2D }
): boolean {
  const player = engine.players.get(characterId);
  const knockback =
    source?.position && player
      ? knockbackAway(
          source.position.x,
          player.playerBody.position.x,
          { x: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_X, y: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_Y },
          player.isFacingLeft ? 1 : -1
        )
      : undefined;
  return engine.applyDamage(
    { kind: 'player', id: characterId },
    { amount, type: 'melee', source: { kind: 'mob', ...source }, knockback }
  ).applied;
}

/**
 * Test helper: makes a block type drop the given items (as if its drop table in the database
 * said so). Blocks without a table drop nothing, so tests that need loot must say what it is.
 */
export function giveBlockDrops(
  engine: MiningGameEngine,
  tileType: MiningTileType,
  items: Array<{ itemId: string; quantity?: number; chance?: number }> = [{ itemId: 'test-item' }]
): void {
  // The data manager is shared by every test in a file: always wrap the real method (never an earlier
  // spy), and call vi.restoreAllMocks() in afterEach so the table doesn't leak into other tests.
  (engine.dataManager.getBlockConfig as any).mockRestore?.();
  const original = engine.dataManager.getBlockConfig.bind(engine.dataManager);
  vi.spyOn(engine.dataManager, 'getBlockConfig').mockImplementation((type: MiningTileType) =>
    type === tileType
      ? {
          ...(original(type) ?? { typeKey: 'TEST', health: 100 }),
          dropTable: {
            items: items.map((i) => ({
              itemId: i.itemId,
              chance: i.chance ?? 100,
              minQuantity: i.quantity ?? 1,
              maxQuantity: i.quantity ?? 1,
            })),
          },
        }
      : original(type)
  );
}
