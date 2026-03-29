import type { 
  CombatAction, 
  CombatState, 
  MobState, 
  PlayerState
} from '../types';
import { calculateDamage, calculateTotalGearDefense } from './combat';

export class CombatEngine {
  /**
   * Processes a single turn of combat where both player and mob take actions simultaneously.
   */
  static processTurn(
    state: CombatState,
    player: PlayerState,
    playerAction: CombatAction,
    mobAction: CombatAction
  ): CombatState {
    const newState = { ...state, turn: state.turn + 1 };

    // 1. Handle Potions (Free actions or priority)
    // For now, let's assume potions are applied before damage calculation
    if (playerAction.type === 'Potion') {
      this.applyPlayerPotion(newState, player, playerAction.itemId);
    }
    if (mobAction.type === 'Potion') {
      // Mobs might use potions too? Not explicitly in PRD but good to have
    }

    // 2. Calculate Damage Dealt by Player
    if (playerAction.type === 'Attack' || playerAction.type === 'Ability') {
      const weaponDamage = player.gear.weapon?.damage || 5; // Base punch damage if no weapon
      const baseArmor = newState.mob.baseArmorScore;
      // Using player's combat score or attributes could scale damage, but PRD formula is simple:
      // (Weapon Damage - Armor Score) * (1 - (Defense Score / 100)) * (1 - (Potion Score / 100))
      
      const damageToMob = calculateDamage(
        weaponDamage + (newState.playerAttackModifier || 0),
        baseArmor,
        newState.mobDefenseModifier || 0,
        0 // Mob potion defense logic
      );
      
      newState.mob.health = Math.max(0, newState.mob.health - damageToMob);
    }

    // 3. Calculate Damage Dealt by Mob
    if (mobAction.type === 'Attack') {
      const mobWeaponDamage = newState.mob.baseDamage;
      const playerDefenseScore = player.attributes.defenseScore + calculateTotalGearDefense(player);
      
      const damageToPlayer = calculateDamage(
        mobWeaponDamage + (newState.mobAttackModifier || 0),
        0, // Player doesn't have "Armor Score" in formula, just Defense Score
        playerDefenseScore,
        newState.playerDefenseModifier || 0
      );

      newState.playerHealth = Math.max(0, newState.playerHealth - damageToPlayer);
    }

    // 4. Update Status
    if (newState.mob.health <= 0) {
      newState.status = 'Victory';
    } else if (newState.playerHealth <= 0) {
      newState.status = 'Defeat';
    }

    // 5. Telegraph next mob action
    newState.mob.intendedAction = this.telegraphNextAction(newState.mob);

    return newState;
  }

  private static applyPlayerPotion(state: CombatState, player: PlayerState, itemId?: string) {
    const potion = player.inventory.items.find(i => i.id === itemId && i.type === 'POTION');
    if (!potion) return;

    // Logic for different potion types would go here
    // For now, simple implementation
  }

  private static telegraphNextAction(mob: MobState): any {
    const probs = mob.actionTelegraphProbabilities;
    const rand = Math.random() * 100;
    let cumulative = 0;
    
    for (const [action, prob] of Object.entries(probs)) {
      cumulative += prob;
      if (rand <= cumulative) return action;
    }
    return 'Attack';
  }
}
