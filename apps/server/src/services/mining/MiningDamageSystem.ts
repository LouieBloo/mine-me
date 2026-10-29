import {
  MINING_CONFIG,
  NO_DAMAGE,
  NO_TILE_DAMAGE,
  MiningTileType,
  isTileMineable,
  isValidDamageAmount,
  type DamageEvent,
  type DamageResult,
  type DamageTarget,
  type MiningPlayerDamagedEvent,
  type TileDamageResult,
} from '@mine-me/shared';
import { getDamageStage, isInBounds } from '../miningMap.service';
import type { MiningPlayerSession } from './subsystems/MiningPlayerManager';
import type { MiningWorld } from './MiningWorld';

/** How long after a player's hit a death caused by the environment (fire, a fall, a rock) still counts as their kill. */
export const MISSION_KILL_CREDIT_SECONDS = 15;

/** The player a damage source traces to: their own hit, or the owner of the bullet or blast. Absent for mobs and the environment. */
export function playerBehind(source: DamageEvent['source']): string | undefined {
  if (source.kind === 'player') return source.id;
  if (source.kind === 'projectile' || source.kind === 'explosion') return source.ownerId;
  return undefined;
}

/**
 * The one place hits are applied. Every source of damage (melee, bullets, explosions, mob
 * attacks, mining) builds a `DamageEvent` and goes through `applyDamage` / `damageTile`, so rules
 * such as immunity, knockback and (later) defense live here rather than in each weapon.
 */
export class MiningDamageSystem {
  constructor(private readonly world: MiningWorld) {}

  /**
   * Hook for damage modifiers. Defense, resistances, crits etc. will go here; today every hit
   * deals its full amount.
   */
  private modifyDamage(_target: DamageTarget, event: DamageEvent): number {
    return event.amount;
  }

  public applyDamage(target: DamageTarget, event: DamageEvent): DamageResult {
    if (!isValidDamageAmount(event.amount)) return NO_DAMAGE;
    const amount = this.modifyDamage(target, event);
    if (!isValidDamageAmount(amount)) return NO_DAMAGE;

    // A belt segment is hit through the same door as everything else (it has health, and breaks)
    if (target.kind === 'belt') return this.world.belt?.damageSegment(Number(target.id), amount) ?? NO_DAMAGE;

    // A doodad with health (a bug, a hanging stalactite) takes the same hits; it dies or falls when its health is used up
    if (target.kind === 'doodad') return this.world.doodads.applyHit(target.id, amount);

    const result =
      target.kind === 'mob'
        ? this.damageMob(target.id, amount, event)
        : this.damagePlayer(target.id, amount, event);

    // A hit by an item that ignites sets flammable things alight where it lands
    if (result.applied && event.source.itemId) {
      const body =
        target.kind === 'mob'
          ? this.world.mobs.activeMobs.get(target.id)?.mobBody
          : this.world.players.get(target.id)?.playerBody;
      if (body) this.world.ignition.fromHit(event, body.position.x, body.position.y);
    }
    return result;
  }

  private damageMob(mobId: string, amount: number, event: DamageEvent): DamageResult {
    const mob = this.world.mobs.activeMobs.get(mobId);
    if (!mob || mob.health <= 0) return NO_DAMAGE;

    const healthBefore = mob.health;
    // Remember which player this hurt it, so fire, a fall or a blast that finishes it soon after still counts for them
    const attacker = playerBehind(event.source);
    if (attacker) {
      mob.lastPlayerHitBy = attacker;
      mob.lastPlayerHitAt = this.world.simTime;
    }
    this.world.mobs.damageMob(mobId, amount, { stun: !event.noStun });

    // Knockback only moves mobs that can move at all (not target dummies / stationary mobs)
    if (event.knockback && mob.mobBody.moveSpeed > 0) {
      mob.mobBody.velocity.x = event.knockback.x;
      mob.mobBody.velocity.y = event.knockback.y;
      mob.mobBody.isGrounded = false;
    }

    const killed = mob.health <= 0;
    if (killed) this.creditMissionKill(mob, attacker);
    return { applied: true, dealt: healthBefore - mob.health, killed };
  }

  /**
   * A mob died: a mission counts every kill (co-op: fire, falls, rocks and gas count too), but only the surface target dummy
   * never does. The contribution on the results screen goes to the player the damage traces to (their own hit, their bullet
   * or their blast), or, when the environment finished it, to the player who hurt it last within MISSION_KILL_CREDIT_SECONDS;
   * a death the environment caused alone counts for the run and for nobody's contribution.
   */
  private creditMissionKill(mob: { mobId: string; lastPlayerHitBy?: string; lastPlayerHitAt?: number }, attacker: string | undefined): void {
    const tracker = this.world.missions;
    if (!tracker || mob.mobId === this.world.mapConfig?.surfaceDummyMobId) return;
    const recent = mob.lastPlayerHitBy !== undefined && mob.lastPlayerHitAt !== undefined && this.world.simTime - mob.lastPlayerHitAt <= MISSION_KILL_CREDIT_SECONDS;
    tracker.onMobKilled(attacker ?? (recent ? mob.lastPlayerHitBy ?? null : null), mob.mobId);
  }

  private damagePlayer(characterId: string, amount: number, event: DamageEvent): DamageResult {
    const session = this.world.players.get(characterId);
    const healthBefore = session?.health ?? 0;
    const { applied, died } = this.world.playerManager.damagePlayer(session, amount, {
      ignoreInvulnerability: event.ignoreInvulnerability,
    });
    if (!applied || !session) return NO_DAMAGE;

    // The killing blow doesn't push; everything else knocks the player back if the hit carries a push
    let knockback = { x: 0, y: 0 };
    if (!died && event.knockback) {
      knockback = { x: event.knockback.x, y: event.knockback.y };
      session.playerBody.applyKnockback(knockback.x, knockback.y, MINING_CONFIG.PLAYER_HIT_KNOCKBACK_SECONDS);
    }

    if (session.socket && session.socket.connected) {
      const hurt: MiningPlayerDamagedEvent = {
        damage: amount,
        health: session.health,
        maxHealth: session.maxHealth,
        sourceId: event.source.id,
        sourceName: event.source.name,
        knockback,
        knockbackSeconds: knockback.x !== 0 || knockback.y !== 0 ? MINING_CONFIG.PLAYER_HIT_KNOCKBACK_SECONDS : 0,
        invulnerableSeconds: MINING_CONFIG.PLAYER_HIT_INVULNERABILITY,
        tick: this.world.tick,
      };
      session.socket.emit('player_damaged', hurt);
    }

    this.world.notifyPlayerHealth(characterId, session.health, session.maxHealth);
    if (died) this.world.queuePlayerDeath(characterId);

    return { applied: true, dealt: healthBefore - session.health, killed: died };
  }

  /**
   * Damages a block. Updates its visible crack stage and mines it through when its health is
   * used up. Loot is dropped unless a mob did it, so mobs can't farm ore for players.
   * `miners` are the players credited with the hit (they stop mining a block that breaks).
   */
  public damageTile(
    x: number,
    y: number,
    event: DamageEvent,
    miners?: MiningPlayerSession[]
  ): TileDamageResult {
    if (!isInBounds(x, y, this.world.grid) || !isValidDamageAmount(event.amount)) return NO_TILE_DAMAGE;

    const tile = this.world.grid[y][x];
    if (!tile || !isTileMineable(tile.type)) return NO_TILE_DAMAGE;

    const amount = event.amount; // tiles have no modifiers yet (pickaxe power etc. come with ticket 012)
    const prevStage = getDamageStage(tile);
    // Sparks fly from the block that was struck, whether or not it breaks
    this.world.ignition.fromTileHit(event, x, y);
    tile.damage = (tile.damage || 0) + amount;

    const maxHealth = this.world.data.getBlockMaxHealth(tile.type);
    if (tile.damage >= maxHealth) {
      const total = tile.damage;
      this.world.blocks.completeMiningBlock({ x, y }, miners, { dropItems: event.source.kind !== 'mob' });
      return { applied: true, dealt: amount, tileDamage: total, destroyed: true };
    }

    const newStage = getDamageStage(tile);
    if (newStage !== prevStage) {
      this.world.pushTileUpdate({ x, y, type: tile.type as MiningTileType, damageStage: newStage });
    }
    return { applied: true, dealt: amount, tileDamage: tile.damage, destroyed: false };
  }
}
