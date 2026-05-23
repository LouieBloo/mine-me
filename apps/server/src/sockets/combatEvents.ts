import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { CombatEngine } from '@nvg/shared/src/gameLogic/CombatEngine';
import type {
  StartCombatPayload,
  CombatActionPayload,
  LeaveCombatPayload,
  AdvanceDungeonLevelPayload,
  GameEventResult,
  BattleState,
  MobBattleState
} from '@nvg/shared';
import { LootService } from '../services/loot.service';
import { BattleService } from '../services/battle.service';

// Helper to push battle state
const pushBattleState = (socket: Socket, state: BattleState) => {
  socket.emit('battle_state', state);
};

export const handleStartCombat = async (
  io: Server,
  socket: Socket,
  payload: StartCombatPayload
): Promise<GameEventResult> => {
  const userId = socket.data.userId;
  const characterId = socket.data.characterId;

  if (!characterId) return { success: false, error: 'No character selected.' };

  const { cityId, dungeonLevelId } = payload;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.cityId !== cityId) {
    return { success: false, error: 'Character is not in this city.' };
  }

  // Fetch the specific dungeon level and verify it belongs to a dungeon in this city
  const dungeonLevel = await prisma.dungeonLevel.findUnique({
    where: { id: dungeonLevelId },
    include: {
      dungeon: {
        include: {
          cityDungeons: { where: { cityId }, take: 1 }
        }
      },
      mobs: {
        include: { mob: true }
      }
    }
  });

  if (!dungeonLevel || dungeonLevel.dungeon.cityDungeons.length === 0) {
    return { success: false, error: 'Dungeon level not found in this city.' };
  }

  if (character.stamina < dungeonLevel.staminaCost) {
    return { success: false, error: 'Not enough stamina to enter the dungeon. Please rest.' };
  }

  // Check if battle already exists
  let battle = await prisma.battle.findUnique({
    where: { characterId }
  });

  if (!battle || battle.status !== 'IN_PROGRESS') {
    // Create new battle
    const rngSeed = Math.random().toString(36).substring(7);
    const mobsState = BattleService.generateInitialMobsState(dungeonLevel.mobs, rngSeed);

    if (battle) {
      battle = await prisma.battle.update({
        where: { id: battle.id },
        data: {
          dungeonLevelId: dungeonLevel.id,
          mobsState: mobsState as any,
          round: 1,
          turn: 'PLAYER',
          rngSeed,
          status: 'IN_PROGRESS'
        }
      });
    } else {
      battle = await prisma.battle.create({
        data: {
          characterId,
          dungeonLevelId: dungeonLevel.id,
          mobsState: mobsState as any,
          round: 1,
          turn: 'PLAYER',
          rngSeed,
          status: 'IN_PROGRESS'
        }
      });
    }
  }

  // Join the battle room
  const battleRoom = `battle:${characterId}`;
  socket.join(battleRoom);

  const state = BattleService.buildBattleState(battle, character);

  pushBattleState(socket, state);

  return { success: true };
};

export const handleCombatAction = async (
  io: Server,
  socket: Socket,
  payload: CombatActionPayload
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const battle = await prisma.battle.findUnique({
    where: { characterId }
  });

  if (!battle || battle.status !== 'IN_PROGRESS' || battle.turn !== 'PLAYER') {
    return { success: false, error: 'Invalid battle state.' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId }
  });
  if (!character) return { success: false, error: 'Character not found.' };

  const currentState = BattleService.buildBattleState(battle, character);

  const playerState = {
    attributes: {
      combatScore: character.combatScore,
      defenseScore: character.defenseScore,
      health: character.health,
      maxHealth: character.maxHealth,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      ageInDays: character.ageInDays,
    }
  } as any;

  // Reconstruct mob actions from their intended actions
  const mobActions = currentState.mobs
    .filter(m => m.health > 0)
    .map(m => {
      if (!m.intendedAction) {
        m.intendedAction = CombatEngine.generateMobAction(m, currentState.rngSeed, currentState.round);
      }
      return {
        type: m.intendedAction,
        actorId: m.id,
        targetId: characterId
      };
    });

  const mappedPlayerActions = payload.actions.map(a => ({
    type: a.action,
    actorId: characterId,
    targetId: a.targetId
  }));

  const newState = CombatEngine.processTurn(
    currentState,
    playerState,
    mappedPlayerActions,
    mobActions
  );

  // Update DB
  await prisma.battle.update({
    where: { id: battle.id },
    data: {
      mobsState: newState.mobs as any,
      round: newState.round,
      status: newState.status,
    }
  });

  // For MVP: sync the damage back to character's health
  if (newState.playerHealth !== currentState.playerHealth) {
    await prisma.character.update({
      where: { id: characterId },
      data: { health: newState.playerHealth }
    });
    // Broadcast character stat update
    io.to(`user:${socket.data.userId}`).emit('character_stat_update', { health: newState.playerHealth });
  }

  // If victory or mobs died, handle loot
  const lootResults: { sol: number; experience: number; items: { itemId: string; quantity: number }[] } = { sol: 0, experience: 0, items: [] };

  // 1. Check for newly dead mobs in this turn
  for (const mob of newState.mobs) {
    const prevMob = currentState.mobs.find(m => m.id === mob.id);
    const wasAlive = prevMob ? prevMob.health > 0 : false;
    const isDead = mob.health <= 0;

    if (wasAlive && isDead) {
      // Fetch mob drop table
      const mobData = await prisma.mob.findUnique({
        where: { id: mob.mobId },
        select: { dropTable: { select: { id: true } } }
      });

      if (mobData?.dropTable) {
        const loot = await LootService.awardLootToCharacter(characterId, mobData.dropTable.id);
        LootService.mergeLoot(lootResults, loot);
      }
    }
  }

  // 2. If victory, handle dungeon level completion loot, dungeon completion, and progression
  if (newState.status === 'VICTORY') {
    await BattleService.processVictory(battle, characterId, lootResults, newState);
    
    // Broadcast updated stamina (decremented in processVictory)
    const updatedCharacter = await prisma.character.findUnique({ where: { id: characterId }, select: { stamina: true } });
    if (updatedCharacter) {
      io.to(`user:${socket.data.userId}`).emit('character_stat_update', { stamina: updatedCharacter.stamina });
    }
  }

  // 3. Emit loot event to client and push character sync if we got anything
  if (lootResults.sol > 0 || lootResults.experience > 0 || lootResults.items.length > 0) {
    socket.emit('combat_loot', lootResults);

    const updatedCharacter = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        inventory: {
          include: {
            item: true
          }
        }
      }
    });
    
    if (updatedCharacter) {
      const inventory = {
        slots: updatedCharacter.maxInventorySlots,
        items: updatedCharacter.inventory.map(inv => ({
          item: {
            id: inv.item.id,
            name: inv.item.name,
            description: inv.item.description,
            type: inv.item.type as any,
            subType: inv.item.subType as any,
            priceSol: inv.item.vendorSellPrice,
            rarity: inv.item.rarity as any,
            iconUrl: inv.item.iconUrl,
            gearImageUrl: inv.item.gearImageUrl,
            isStartingPiece: inv.item.isStartingPiece,
            experience: inv.item.experience,
          },
          quantity: inv.quantity,
        })),
      };

      io.to(`user:${socket.data.userId}`).emit('character_stat_update', {
        sol: updatedCharacter.sol,
        experience: updatedCharacter.experience,
        inventory
      });
    }
  }

  pushBattleState(socket, newState);

  return { success: true };
};

// ----------------------------------------------------------------------------
// Handler: advance_dungeon_level
// Called after a VICTORY to start a new battle on the next dungeon level.
// ----------------------------------------------------------------------------
export const handleAdvanceDungeonLevel = async (
  io: Server,
  socket: Socket,
  payload: AdvanceDungeonLevelPayload
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const battle = await prisma.battle.findUnique({ where: { characterId } });
  if (!battle || battle.status !== 'VICTORY') {
    return { success: false, error: 'No completed battle to advance from.' };
  }

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return { success: false, error: 'Character not found.' };

  // Find the current dungeon level and next level
  const currentLevel = await prisma.dungeonLevel.findUnique({
    where: { id: battle.dungeonLevelId },
    include: {
      dungeon: {
        include: {
          levels: { orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } }
        }
      }
    }
  });

  if (!currentLevel) {
    return { success: false, error: 'Current dungeon level not found.' };
  }

  const levels = currentLevel.dungeon.levels;
  const currentIndex = levels.findIndex(l => l.id === currentLevel.id);
  const nextLevel = currentIndex >= 0 && currentIndex < levels.length - 1
    ? levels[currentIndex + 1]
    : null;

  if (!nextLevel) {
    return { success: false, error: 'No next level available.' };
  }

  // Fetch the next dungeon level's mobs
  const nextDungeonLevel = await prisma.dungeonLevel.findUnique({
    where: { id: nextLevel.id },
    include: { mobs: { include: { mob: true } } }
  });

  if (!nextDungeonLevel || nextDungeonLevel.mobs.length === 0) {
    return { success: false, error: 'Next dungeon level has no mobs.' };
  }

  if (character.stamina < nextDungeonLevel.staminaCost) {
    return { success: false, error: 'Not enough stamina to continue. You must retreat and rest.' };
  }

  // Build new battle state
  const rngSeed = Math.random().toString(36).substring(7);
  const mobsState = BattleService.generateInitialMobsState(nextDungeonLevel.mobs, rngSeed);

  // Update existing battle record for the next level
  const updatedBattle = await prisma.battle.update({
    where: { id: battle.id },
    data: {
      dungeonLevelId: nextLevel.id,
      mobsState: mobsState as any,
      round: 1,
      turn: 'PLAYER',
      rngSeed,
      status: 'IN_PROGRESS',
    }
  });

  const state = BattleService.buildBattleState(updatedBattle, character);

  pushBattleState(socket, state);

  return { success: true };
};

export const handleLeaveCombat = async (
  io: Server,
  socket: Socket,
  payload: LeaveCombatPayload
): Promise<GameEventResult> => {
  const characterId = socket.data.characterId;
  if (!characterId) return { success: false, error: 'No character selected.' };

  const battle = await prisma.battle.findUnique({
    where: { characterId }
  });

  if (battle) {
    await prisma.battle.delete({
      where: { id: battle.id }
    });
  }

  socket.leave(`battle:${characterId}`);

  // Clear client battle state
  socket.emit('battle_state', null);

  return { success: true };
};

