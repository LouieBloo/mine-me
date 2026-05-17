import { prisma } from '../index';
import { CombatEngine } from '@nvg/shared/src/gameLogic/CombatEngine';
import type { BattleState, MobBattleState } from '@nvg/shared';
import { LootService, type LootResult } from './loot.service';

export class BattleService {
  /**
   * Generates the initial MobBattleState array for a given list of DungeonLevelMobs.
   */
  public static generateInitialMobsState(mobs: any[], rngSeed: string): MobBattleState[] {
    const mobsState: MobBattleState[] = mobs.map(m => ({
      id: m.id, // using DungeonLevelMob ID as unique battle mob ID
      mobId: m.mob.id,
      name: m.mob.name,
      level: m.mob.level,
      health: m.mob.health,
      maxHealth: m.mob.health,
      attack: m.mob.attack,
      defense: m.mob.defense,
      attackPercentage: m.mob.attackPercentage,
      defendPercentage: m.mob.defendPercentage,
      animations: m.mob.animations,
      consecutiveAttacks: 0,
      consecutiveDefends: 0,
    }));

    for (const m of mobsState) {
      m.intendedAction = CombatEngine.generateMobAction(m, rngSeed, 1);
    }

    return mobsState;
  }

  /**
   * Constructs the BattleState object to be sent to the client.
   */
  public static buildBattleState(battle: any, character: any): BattleState {
    return {
      id: battle.id,
      characterId: battle.characterId,
      dungeonLevelId: battle.dungeonLevelId,
      playerHealth: character.health,
      playerMaxHealth: character.maxHealth,
      mobs: battle.mobsState as unknown as MobBattleState[],
      round: battle.round,
      turn: battle.turn as any,
      status: battle.status as any,
      rngSeed: battle.rngSeed,
    };
  }

  /**
   * Processes the progression after a victory, including:
   * - Fetching the dungeon hierarchy
   * - Awarding level and dungeon completion loot
   * - Setting the next level ID or marking the dungeon as complete
   * - Recording accomplishments
   *
   * Mutates `newState` and `lootResults` in place.
   */
  public static async processVictory(
    battle: any,
    characterId: string,
    lootResults: LootResult,
    newState: BattleState
  ): Promise<void> {
    // Fetch current dungeon level with its dungeon and sibling levels
    const dungeonLevel = await prisma.dungeonLevel.findUnique({
      where: { id: battle.dungeonLevelId },
      include: {
        completionDropTable: { select: { id: true } },
        dungeon: {
          include: {
            levels: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } },
            completionDropTable: { select: { id: true } },
          }
        }
      }
    });

    // Award dungeon level completion loot
    if (dungeonLevel?.completionDropTable) {
      const loot = await LootService.awardLootToCharacter(characterId, dungeonLevel.completionDropTable.id);
      LootService.mergeLoot(lootResults, loot);
    }

    // Record accomplishment for this dungeon level
    await prisma.accomplishment.upsert({
      where: {
        characterId_type_referenceId: {
          characterId,
          type: 'DUNGEON_LEVEL_CLEARED',
          referenceId: battle.dungeonLevelId,
        }
      },
      update: {},
      create: {
        characterId,
        type: 'DUNGEON_LEVEL_CLEARED',
        referenceId: battle.dungeonLevelId,
      }
    });

    // Determine dungeon progression
    if (dungeonLevel?.dungeon) {
      const levels = dungeonLevel.dungeon.levels;
      const currentIndex = levels.findIndex(l => l.id === battle.dungeonLevelId);
      const nextLevel = currentIndex >= 0 && currentIndex < levels.length - 1
        ? levels[currentIndex + 1]
        : null;

      if (nextLevel) {
        // More levels remain
        newState.nextDungeonLevelId = nextLevel.id;
        newState.isDungeonComplete = false;
      } else {
        // Last level — dungeon is complete
        newState.nextDungeonLevelId = null;
        newState.isDungeonComplete = true;

        // Award dungeon completion loot
        if (dungeonLevel.dungeon.completionDropTable) {
          const loot = await LootService.awardLootToCharacter(
            characterId,
            dungeonLevel.dungeon.completionDropTable.id
          );
          LootService.mergeLoot(lootResults, loot);
        }

        // Record dungeon cleared accomplishment
        await prisma.accomplishment.upsert({
          where: {
            characterId_type_referenceId: {
              characterId,
              type: 'DUNGEON_CLEARED',
              referenceId: dungeonLevel.dungeon.id,
            }
          },
          update: {},
          create: {
            characterId,
            type: 'DUNGEON_CLEARED',
            referenceId: dungeonLevel.dungeon.id,
          }
        });
      }
    }

    // Decrement stamina for completing the dungeon level
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (character && dungeonLevel) {
      await prisma.character.update({
        where: { id: characterId },
        data: { stamina: Math.max(0, character.stamina - dungeonLevel.staminaCost) }
      });
    }
  }
}
