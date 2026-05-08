import type { 
  CombatAction, 
  BattleState, 
  DamageEvent,
  MobBattleState, 
  PlayerState,
  CombatActionType
} from '../types';

export class CombatEngine {
  /**
   * Processes a single turn of combat.
   * Resolves player and mob actions simultaneously.
   */
  static processTurn(
    state: BattleState,
    player: PlayerState,
    playerActions: CombatAction[],
    mobActions: CombatAction[]
  ): BattleState {
    // Deep clone the state to avoid mutating the input
    const newState: BattleState = JSON.parse(JSON.stringify(state));
    newState.round += 1;
    newState.turnLogs = [];
    newState.damageEvents = [];

    const addLog = (message: string, type: 'damage' | 'defense' | 'info' | 'system', actorName?: string, targetName?: string) => {
      newState.turnLogs!.push({
        id: Math.random().toString(36).substring(7),
        message,
        type,
        actorName,
        targetName
      });
    };

    addLog(`--- Round ${newState.round} ---`, 'system');

    // Map actions by actor ID for easy lookup
    const playerActionMap = new Map<string, CombatAction>(playerActions.map(a => [a.targetId, a]));
    const mobActionMap = new Map<string, CombatAction>(mobActions.map(a => [a.actorId, a]));

    // 1. Calculate Damage Dealt by Player
    // For each mob, the player may have submitted an action against it.
    for (const mob of newState.mobs) {
      if (mob.health <= 0) continue;

      const playerAction = playerActionMap.get(mob.id);
      if (playerAction && playerAction.type === 'Attack') {
        let damageToMob = player.attributes.combatScore || 5; // Base damage

        // If mob is defending, reduce damage by 80%
        const mobAction = mobActionMap.get(mob.id);
        const isBlocked = mobAction && mobAction.type === 'Defend';
        if (isBlocked) {
          const originalDamage = damageToMob;
          damageToMob = Math.floor(damageToMob * 0.2);
          addLog(`${mob.name} guarded against your attack! Damage reduced from ${originalDamage} to ${damageToMob}.`, 'defense', mob.name, player.characterName);
        }

        mob.health = Math.max(0, mob.health - damageToMob);
        addLog(`You dealt ${damageToMob} damage to ${mob.name}.`, 'damage', player.characterName, mob.name);

        // Record damage event for floating indicators
        newState.damageEvents!.push({
          targetId: mob.id,
          amount: damageToMob,
          type: isBlocked ? 'blocked' : 'damage',
          sourceId: 'player',
        });
      } else if (playerAction && playerAction.type === 'Defend') {
        addLog(`You prepared to defend against ${mob.name}.`, 'info', player.characterName, mob.name);
      }
    }

    // 2. Calculate Damage Dealt by Mobs
    let totalDamageToPlayer = 0;
    const playerDefending = playerActions.some(a => a.type === 'Defend'); // If player defended ANY mob, do they get defense against all?
    // PRD: "If there are multiple mobs, the player chooses an action to take on EACH mob."
    // If player attacks Mob A and defends Mob B, do they get 80% reduction from Mob B? Yes.
    
    for (const mob of newState.mobs) {
      if (mob.health <= 0) continue; // Dead mobs don't deal damage

      const mobAction = mobActionMap.get(mob.id);
      if (mobAction && mobAction.type === 'Attack') {
        let damageToPlayer = mob.attack;

        // Check if player defended against THIS mob
        const playerActionAgainstMob = playerActionMap.get(mob.id);
        const isPlayerBlocking = playerActionAgainstMob && playerActionAgainstMob.type === 'Defend';
        if (isPlayerBlocking) {
          const originalDamage = damageToPlayer;
          damageToPlayer = Math.floor(damageToPlayer * 0.2);
          addLog(`You blocked ${mob.name}'s attack! Damage reduced from ${originalDamage} to ${damageToPlayer}.`, 'defense', player.characterName, mob.name);
        }

        totalDamageToPlayer += damageToPlayer;
        addLog(`${mob.name} attacked you for ${damageToPlayer} damage!`, 'damage', mob.name, player.characterName);

        // Record damage event for floating indicators on the player
        newState.damageEvents!.push({
          targetId: 'player',
          amount: damageToPlayer,
          type: isPlayerBlocking ? 'blocked' : 'damage',
          sourceId: mob.id,
        });
      } else if (mobAction && mobAction.type === 'Defend') {
        // Only log if they didn't get hit, because if they got hit, we already logged the block
        const playerActionAgainstMob = playerActionMap.get(mob.id);
        if (!playerActionAgainstMob || playerActionAgainstMob.type !== 'Attack') {
          addLog(`${mob.name} stands defensively.`, 'info', mob.name);
        }
      }
    }

    newState.playerHealth = Math.max(0, newState.playerHealth - totalDamageToPlayer);

    // 3. Update Status
    const allMobsDead = newState.mobs.every(m => m.health <= 0);
    if (newState.playerHealth <= 0) {
      newState.status = 'DEFEAT';
    } else if (allMobsDead) {
      newState.status = 'VICTORY';
    }

    // 4. Update naive AI tracking & generate next actions
    for (const mob of newState.mobs) {
      if (mob.health <= 0) continue;
      
      const lastAction = mobActionMap.get(mob.id);
      if (lastAction) {
        if (lastAction.type === 'Attack') {
          mob.consecutiveAttacks += 1;
          mob.consecutiveDefends = 0;
        } else if (lastAction.type === 'Defend') {
          mob.consecutiveDefends += 1;
          mob.consecutiveAttacks = 0;
        }
      }

      // Generate next action
      mob.intendedAction = this.generateMobAction(mob, newState.rngSeed, newState.round);
    }

    return newState;
  }

  static generateMobAction(mob: MobBattleState, seed: string, round: number): CombatActionType {
    // Naive AI guard
    if (mob.consecutiveAttacks >= 3) return 'Defend';
    if (mob.consecutiveDefends >= 3) return 'Attack';

    // Simple pseudo-random using seed and round
    const hash = Array.from(seed + round + mob.id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rand = hash % 100; // 0 to 99

    if (rand < mob.attackPercentage) {
      return 'Attack';
    }
    return 'Defend';
  }
}
