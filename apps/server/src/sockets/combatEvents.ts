import { Server, Socket } from 'socket.io';
import { prisma } from '../index';
import { CombatEngine } from '@nvg/shared/src/gameLogic/CombatEngine';
import type { 
  StartCombatPayload, 
  CombatActionPayload, 
  LeaveCombatPayload, 
  GameEventResult, 
  BattleState,
  MobBattleState
} from '@nvg/shared';
import { LootService } from '../services/loot.service';

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

  const { cityId } = payload;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character || character.userId !== userId) {
    return { success: false, error: 'Character not found or forbidden.' };
  }

  if (character.cityId !== cityId) {
    return { success: false, error: 'Character is not in this city.' };
  }

  // MVP: Find the first dungeon level in the given city
  const cityDungeon = await prisma.cityDungeon.findFirst({
    where: { cityId },
    include: {
      dungeon: {
        include: {
          levels: {
            orderBy: { orderIndex: 'asc' },
            take: 1,
            include: {
              mobs: {
                include: { mob: true }
              }
            }
          }
        }
      }
    }
  });

  const dungeonLevel = cityDungeon?.dungeon.levels[0];

  if (!dungeonLevel) return { success: false, error: 'No dungeon found in this city.' };

  // Check if battle already exists
  let battle = await prisma.battle.findUnique({
    where: { characterId }
  });

  if (!battle || battle.status !== 'IN_PROGRESS') {
    // Create new battle
    const rngSeed = Math.random().toString(36).substring(7);
    const mobsState: MobBattleState[] = dungeonLevel.mobs.map(m => ({
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

    // Initial intended actions
    for (const m of mobsState) {
      m.intendedAction = CombatEngine.generateMobAction(m, rngSeed, 1);
    }

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

  const state: BattleState = {
    id: battle.id,
    characterId: battle.characterId,
    dungeonLevelId: battle.dungeonLevelId,
    playerHealth: character.health,
    playerMaxHealth: character.maxHealth,
    mobs: battle.mobsState as unknown as MobBattleState[],
    round: battle.round,
    turn: battle.turn as any,
    status: battle.status as any,
    rngSeed: battle.rngSeed
  };

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

  const currentState: BattleState = {
    id: battle.id,
    characterId: battle.characterId,
    dungeonLevelId: battle.dungeonLevelId,
    playerHealth: character.health,
    playerMaxHealth: character.maxHealth,
    mobs: battle.mobsState as unknown as MobBattleState[],
    round: battle.round,
    turn: battle.turn as any,
    status: battle.status as any,
    rngSeed: battle.rngSeed
  };

  const playerState = {
    attributes: {
      combatScore: character.combatScore,
      defenseScore: character.defenseScore,
      health: character.health,
      maxHealth: character.maxHealth,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      ageInDays: character.ageInDays,
      level: character.level,
    }
  } as any;

  // Reconstruct mob actions from their intended actions
  const mobActions = currentState.mobs
    .filter(m => m.health > 0)
    .map(m => ({
      type: m.intendedAction!,
      actorId: m.id,
      targetId: characterId
    }));

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
  const lootResults: { sol: number; items: { itemId: string; quantity: number }[] } = { sol: 0, items: [] };

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
        lootResults.sol += loot.sol;
        // Merge items safely
        for (const item of loot.items) {
          const existing = lootResults.items.find(i => i.itemId === item.itemId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            lootResults.items.push({ ...item });
          }
        }
      }
    }
  }

  // 2. If victory, handle dungeon level completion loot
  if (newState.status === 'VICTORY') {
    const dungeonLevel = await prisma.dungeonLevel.findUnique({
      where: { id: battle.dungeonLevelId },
      select: { completionDropTable: { select: { id: true } } }
    });

    if (dungeonLevel?.completionDropTable) {
      const loot = await LootService.awardLootToCharacter(characterId, dungeonLevel.completionDropTable.id);
      lootResults.sol += loot.sol;
      // Merge items safely
      for (const item of loot.items) {
        const existing = lootResults.items.find(i => i.itemId === item.itemId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          lootResults.items.push({ ...item });
        }
      }
    }
  }

  // 3. Emit loot event to client and push character sync if we got anything
  if (lootResults.sol > 0 || lootResults.items.length > 0) {
    socket.emit('combat_loot', lootResults);
    
    // We also need to emit character_stat_update for Sol so the UI updates immediately
    const updatedCharacter = await prisma.character.findUnique({ where: { id: characterId }, select: { sol: true } });
    if (updatedCharacter) {
       io.to(`user:${socket.data.userId}`).emit('character_stat_update', { sol: updatedCharacter.sol });
    }
  }

  pushBattleState(socket, newState);

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

/**
 * Resolves a drop table and returns the Sol and Items rewarded.
 */
async function resolveDropTable(dt: any) {
  const sol = Math.floor(Math.random() * (dt.solMax - dt.solMin + 1)) + dt.solMin;
  const items: { itemId: string; quantity: number }[] = [];

  for (const entry of dt.items) {
    const roll = Math.random() * 100;
    if (roll <= entry.chance) {
      const quantity = Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1)) + entry.minQuantity;
      if (quantity > 0) {
        items.push({ itemId: entry.itemId, quantity });
      }
    }
  }

  return { sol, items };
}
