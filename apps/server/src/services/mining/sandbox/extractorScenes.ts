import { MiningTileType, type SandboxMobOption } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';

/**
 * Named test scenes for the extractor and its belt (like the fluid scenes): each one puts the real game into a situation
 * that is hard to reach by hand, so a bug can be reproduced, and then fixed, from the same starting point. A scene works
 * through the room's own subsystems, never around them.
 */
export interface ExtractorScene {
  id: string;
  name: string;
  description: string;
  apply(engine: MiningGameEngine, characterId: string): { ok: true } | { ok: false; error: string };
}

/** The most segments a scene digs (the sandbox map is not tall). */
const SCENE_BELT_ROWS = 10;

/** Makes sure there is an extractor that has landed with `rows` segments dug, and returns its belt. */
function readyBelt(engine: MiningGameEngine, rows: number) {
  engine.spawnExtractorNow();
  const extractor = engine.extractorSubsystem!;
  // Landed now: skip the flight
  extractor.skipLanding();
  const belt = engine.beltSubsystem!;
  belt.buildInstantly(rows);
  return belt;
}

const standOnBelt = (engine: MiningGameEngine, characterId: string, depth: number) => {
  const belt = engine.beltSubsystem!;
  const body = engine.getPlayer(characterId)!.playerBody;
  body.position = { x: belt.shaftX + belt.shaftWidth / 2, y: belt.startRow + depth };
  body.velocity = { x: 0, y: 0 };
};

const give = (engine: MiningGameEngine, characterId: string, itemId: string, quantity: number) => {
  const session = engine.getPlayer(characterId)!;
  const def = engine.dataManager.getItemData(itemId);
  const held = session.temporaryBackpack.find((s) => s.itemId === itemId);
  if (held) held.quantity += quantity;
  else session.temporaryBackpack.push({ itemId, itemName: def?.name ?? itemId, iconUrl: def?.iconUrl ?? null, quantity });
  session.backpackDirty = true;
};

/** Some item that can be carried: the heaviest the room knows, so a pack fills quickly. */
export const heaviestItemId = (engine: MiningGameEngine): string | null => {
  const items = engine.dataManager.getItems().filter((item) => (item.weight ?? 0) > 0);
  items.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return items[0]?.id ?? engine.dataManager.getItems()[0]?.id ?? null;
};

export const EXTRACTOR_SCENES: readonly ExtractorScene[] = [
  {
    id: 'belt-blocked-by-fluid',
    name: 'Belt blocked by fluid',
    description: 'The belt is dug a few segments and the next row is a pool of fluid. It waits, and says why, until the fluid is cleared.',
    apply(engine) {
      const fluid = engine.dataManager.getFluids()[0];
      if (!fluid) return { ok: false, error: 'There is no fluid to put in the way.' };
      const belt = readyBelt(engine, 4);
      const row = belt.tipRow;
      for (let x = belt.shaftX - 1; x <= belt.shaftX + belt.shaftWidth; x++) {
        if (engine.grid[row]?.[x]) {
          engine.grid[row][x] = { type: MiningTileType.EMPTY, revealed: true };
          engine.rigidWorld.removeTileCollider(x, row);
          engine.fluidSubsystem.onTileChanged(x, row);
          engine.gasSubsystem.onTileChanged(x, row);
        }
      }
      for (let x = belt.shaftX; x < belt.shaftX + belt.shaftWidth; x++) engine.fluidSubsystem.placeFluid(x, row, fluid.typeKey, 1);
      return { ok: true };
    },
  },
  {
    id: 'mob-attacking-segment',
    name: 'Mob attacking a segment',
    description: 'A stationary mob that goes for the belt stands beside the shaft and hits a segment until it breaks; the belt then mends it.',
    apply(engine) {
      const base = engine.dataManager.getMobs().find((mob) => (mob.health ?? 0) > 0);
      if (!base) return { ok: false, error: 'There is no mob to use.' };
      const belt = readyBelt(engine, SCENE_BELT_ROWS);
      const biter = {
        ...base,
        id: `${base.id}_belt_biter`,
        aiType: 'STATIONARY' as const,
        aiConfig: { ...(base.aiConfig ?? {}), attacksBelt: true, attackRange: 3, attackWindupMs: 0 },
        mobEffects: [],
      };
      const mob = engine.mobSubsystem.spawnMob(biter as typeof base, { x: belt.shaftX - 1.5, y: belt.startRow + 4.5 });
      // A mob with no Damage effect would do nothing: give this one enough to break a segment in a few hits
      mob.stats = { ...mob.stats, weaponDamage: engine.extractorSubsystem!.definition.beltSegmentHealth / 3, miningSpeed: 50 };
      return { ok: true };
    },
  },
  {
    id: 'full-pack-at-belt',
    name: 'Full pack at the belt',
    description: 'You stand on the belt with a full backpack. Items go on one at a time, heaviest first, and the belt backs up when it is busy.',
    apply(engine, characterId) {
      const itemId = heaviestItemId(engine);
      if (!itemId) return { ok: false, error: 'There are no items to carry.' };
      readyBelt(engine, SCENE_BELT_ROWS);
      const session = engine.getPlayer(characterId);
      if (!session) return { ok: false, error: 'You are not in the room.' };
      const unit = Math.max(0.1, engine.dataManager.getItemData(itemId)?.weight ?? 1);
      give(engine, characterId, itemId, Math.floor(session.carryCapacity / unit));
      standOnBelt(engine, characterId, SCENE_BELT_ROWS - 1);
      return { ok: true };
    },
  },
  {
    id: 'items-on-belt-then-death',
    name: 'Items on the belt, then death',
    description: 'Items are already riding the belt and more are waiting in your pack. Die (or leave) before they arrive and they are lost; let them arrive and they are safe in the stash.',
    apply(engine, characterId) {
      const itemId = heaviestItemId(engine);
      if (!itemId) return { ok: false, error: 'There are no items to carry.' };
      const belt = readyBelt(engine, SCENE_BELT_ROWS);
      give(engine, characterId, itemId, 12);
      standOnBelt(engine, characterId, SCENE_BELT_ROWS - 1);
      const def = engine.dataManager.getItemData(itemId);
      for (let i = 0; i < 4; i++) {
        belt.items.push({ id: `scene_${i}`, itemId, itemName: def?.name ?? itemId, iconUrl: def?.iconUrl ?? null, ownerId: characterId, pos: 2 + i * 1.8 });
      }
      return { ok: true };
    },
  },
];

export const EXTRACTOR_SCENE_OPTIONS: readonly SandboxMobOption[] = EXTRACTOR_SCENES.map((scene) => ({ id: scene.id, name: scene.name }));

export function findExtractorScene(id: unknown): ExtractorScene | undefined {
  return typeof id === 'string' ? EXTRACTOR_SCENES.find((scene) => scene.id === id) : undefined;
}
