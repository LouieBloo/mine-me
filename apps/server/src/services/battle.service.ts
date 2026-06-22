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
    const mobs = (battle.mobsState as unknown as MobBattleState[]).map(m => {
      if (!m.intendedAction) {
        m.intendedAction = CombatEngine.generateMobAction(m, battle.rngSeed, battle.round);
      }
      return m;
    });

    return {
      id: battle.id,
      characterId: battle.characterId,
      dungeonLevelId: battle.dungeonLevelId,
      playerHealth: character.health,
      playerMaxHealth: character.maxHealth,
      mobs,
      round: battle.round,
      turn: battle.turn as any,
      status: battle.status as any,
      rngSeed: battle.rngSeed,
    };
  }

  /**
   * Generates and awards all loot after combat is finished (victory).
   * Calculates loot from all defeated mobs in mobsState, level completion, and dungeon completion.
   */
  public static async awardAfterCombatLoot(
    characterId: string,
    dungeonLevelId: string,
    mobsState: any[]
  ): Promise<LootResult> {
    const lootResults: LootResult = { sol: 0, experience: 0, items: [] };

    // 1. Generate loot for all defeated mobs in mobsState (health <= 0)
    for (const mob of mobsState) {
      if (mob.health <= 0) {
        const mobData = await prisma.mob.findUnique({
          where: { id: mob.mobId },
          select: { dropTable: { select: { id: true } } }
        });

        if (mobData?.dropTable) {
          const loot = await LootService.resolveDropTable(mobData.dropTable.id);
          LootService.mergeLoot(lootResults, loot);
        }
      }
    }

    // 2. Award dungeon level completion loot
    const dungeonLevel = await prisma.dungeonLevel.findUnique({
      where: { id: dungeonLevelId },
      include: {
        completionDropTable: { select: { id: true } },
        dungeon: {
          include: {
            levels: { orderBy: { orderIndex: 'asc' }, select: { id: true } },
            completionDropTable: { select: { id: true } },
          }
        }
      }
    });

    if (dungeonLevel?.completionDropTable) {
      const loot = await LootService.resolveDropTable(dungeonLevel.completionDropTable.id);
      LootService.mergeLoot(lootResults, loot);
    }

    // 3. Award dungeon completion loot if we completed the final level
    if (dungeonLevel?.dungeon) {
      const levels = dungeonLevel.dungeon.levels;
      const currentIndex = levels.findIndex(l => l.id === dungeonLevelId);
      const isLastLevel = currentIndex === levels.length - 1;

      if (isLastLevel && dungeonLevel.dungeon.completionDropTable) {
        const loot = await LootService.resolveDropTable(dungeonLevel.dungeon.completionDropTable.id);
        LootService.mergeLoot(lootResults, loot);
      }
    }

    // Award all the aggregated loot in a generic, reusable way
    const awardedLoot = await LootService.awardLootResultToCharacter(characterId, lootResults);
    return awardedLoot;
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
    // Award all after-combat loot (mobs + level completion + dungeon completion)
    const combatLoot = await this.awardAfterCombatLoot(characterId, battle.dungeonLevelId, newState.mobs);
    LootService.mergeLoot(lootResults, combatLoot);

    // Fetch current dungeon level with its dungeon and sibling levels
    const dungeonLevel = await prisma.dungeonLevel.findUnique({
      where: { id: battle.dungeonLevelId },
      include: {
        dungeon: {
          include: {
            levels: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } },
          }
        }
      }
    });

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
