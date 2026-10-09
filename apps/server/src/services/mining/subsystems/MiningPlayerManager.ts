import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  isTileSolid,
  knockbackImpulse,
  sanitizeMiningInput,
  type MiningBackpackItem,
  type MiningCombatStats,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';
import { MiningPlayerBody } from '../physics/MiningPlayerBody';
import { createKnownEntities, type KnownEntities } from '../MiningEntitySync';
import type { MiningWorld } from '../MiningWorld';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';

export interface MiningPlayerSession {
  characterId: string;
  characterName: string;
  socket: Socket;
  playerBody: MiningPlayerBody;
  inputs: MiningInputState;
  miningSpeed: number | (() => number);
  /** Damage per swing to blocks (Tool Damage). */
  toolDamage: number;
  /** Damage per hit to mobs (Damage). */
  weaponDamage: number;
  /** Hardest block this gear can break (Pick Power). */
  pickPower: number;
  /** Melee knockback, tenths of tiles/s; 0 = default push. */
  knockback: number;
  temporaryBackpack: MiningBackpackItem[];
  gearLayers: MiningGearLayer[];
  /** Bumped whenever gearLayers change, so other clients re-fetch this player's description. */
  gearVersion: number;
  /** Which entity definitions this client has already been sent (see MiningEntitySync). */
  known: KnownEntities;
  /** Item id of the equipped WEAPON-slot gear (server-resolved, never client-supplied). */
  equippedWeaponId: string | null;
  visionRange: number;
  /** Run health (never client-supplied). */
  health: number;
  maxHealth: number;
  /** Seconds of damage immunity left after a hit. */
  invulnerableSeconds: number;
  isDead: boolean;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  miningProgressMs: number;
  miningTimeMs: number;
  targetMaxHealth?: number;
  isFacingLeft: boolean;
  aimDirection: Vector2D;
  flashlightOn: boolean;
  animationState: 'idle' | 'walk' | 'mine' | 'jump' | 'climb';
  lastRevealGridPos?: MiningPosition | null;
  backpackDirty?: boolean;
  /** Seconds until the next swing may start. One timer drives block damage and melee alike. */
  swingCooldown: number;
  /** A swing fired this tick (set by `advanceSwings`, consumed by block mining and melee). */
  swungThisTick: boolean;
  /** Seconds before another tool notice may be sent to this player. */
  noticeCooldown: number;
}

function isObstructedBySolidTiles(
  grid: ServerMiningGrid,
  px: number,
  py: number,
  mx: number,
  my: number
): boolean {
  const dx = mx - px;
  const dy = my - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.8) return false;

  const steps = Math.ceil(dist / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sampleX = px + dx * t;
    const sampleY = py + dy * t;
    const tx = Math.floor(sampleX);
    const ty = Math.floor(sampleY);

    if (tx === Math.floor(px) && ty === Math.floor(py)) continue;
    if (tx === Math.floor(mx) && ty === Math.floor(my)) continue;

    if (isInBounds(tx, ty)) {
      const tile = grid[ty][tx];
      if (tile && isTileSolid(tile.type)) {
        return true;
      }
    }
  }
  return false;
}

export class MiningPlayerManager {
  public players: Map<string, MiningPlayerSession> = new Map();

  constructor(private readonly world: MiningWorld) {}

  public get playerCount(): number {
    return this.players.size;
  }

  public getPlayer(characterId: string): MiningPlayerSession | undefined {
    return this.players.get(characterId);
  }

  public addPlayer(options: {
    characterId: string;
    characterName?: string;
    socket: Socket;
    miningSpeed?: number | (() => number);
    gearLayers?: MiningGearLayer[];
    equippedWeaponId?: string | null;
    maxHealth?: number;
  } & Partial<MiningCombatStats>): MiningPlayerSession {
    let session = this.players.get(options.characterId);
    if (session) {
      if (options.equippedWeaponId !== undefined) session.equippedWeaponId = options.equippedWeaponId;
      session.socket = options.socket;
      if (options.miningSpeed !== undefined) session.miningSpeed = options.miningSpeed;
      if (options.toolDamage !== undefined) session.toolDamage = options.toolDamage;
      if (options.weaponDamage !== undefined) session.weaponDamage = options.weaponDamage;
      if (options.pickPower !== undefined) session.pickPower = options.pickPower;
      if (options.knockback !== undefined) session.knockback = options.knockback;
      if (options.gearLayers !== undefined) this.updateGear(session, options.gearLayers);
      // A (re)joining client starts with nothing, so every entity must be described to it again
      session.known = createKnownEntities();
      if (options.characterName) session.characterName = options.characterName;
      return session;
    }

    const maxHealth =
      typeof options.maxHealth === 'number' && Number.isFinite(options.maxHealth) && options.maxHealth > 0
        ? Math.floor(options.maxHealth)
        : MINING_CONFIG.DEFAULT_PLAYER_MAX_HEALTH;

    const initialPos = {
      x: MINING_CONFIG.ENTRANCE_X,
      y: MINING_CONFIG.ENTRANCE_Y,
    };
    const playerBody = new MiningPlayerBody(initialPos);

    session = {
      characterId: options.characterId,
      characterName: options.characterName || 'Miner',
      socket: options.socket,
      playerBody,
      inputs: {
        up: false,
        down: false,
        left: false,
        right: false,
        jump: false,
        miningKey: false,
        sequence: 0,
      },
      miningSpeed: options.miningSpeed ?? 0,
      toolDamage: options.toolDamage ?? 25,
      weaponDamage: options.weaponDamage ?? 25,
      pickPower: options.pickPower ?? 0,
      knockback: options.knockback ?? 0,
      swingCooldown: 0,
      swungThisTick: false,
      noticeCooldown: 0,
      temporaryBackpack: [],
      gearLayers: options.gearLayers || [],
      gearVersion: 0,
      known: createKnownEntities(),
      equippedWeaponId: options.equippedWeaponId ?? null,
      visionRange: MINING_CONFIG.DEFAULT_VISION_RANGE,
      // A run always starts at full health; this is only applied when the session is first created
      health: maxHealth,
      maxHealth,
      invulnerableSeconds: 0,
      isDead: false,
      isMining: false,
      miningTarget: null,
      miningProgressMs: 0,
      miningTimeMs: 0,
      isFacingLeft: false,
      aimDirection: { x: 1, y: 0 },
      flashlightOn: false,
      animationState: 'idle',
      lastRevealGridPos: null,
      backpackDirty: true,
    };

    this.players.set(options.characterId, session);

    return session;
  }

  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const session = this.players.get(characterId);
    if (!session) return null;

    const extracted = [...session.temporaryBackpack];
    this.players.delete(characterId);


    return { extractedItems: extracted };
  }

  public handleInput(characterId: string, input: MiningInputState): void {
    const session = this.players.get(characterId);
    if (!session) return;

    // Untrusted client data: on malformed payloads keep the previous valid input.
    const clean = sanitizeMiningInput(input);
    if (!clean) {
      console.debug(`[Mining] Dropped malformed input from ${characterId}`);
      return;
    }
    input = clean;

    session.inputs = { ...input };

    if (input.aimDirection) {
      session.aimDirection = { x: input.aimDirection.x, y: input.aimDirection.y };
    }

    if (typeof input.isFacingLeft === 'boolean') {
      session.isFacingLeft = input.isFacingLeft;
    } else if (input.left && !input.right) {
      session.isFacingLeft = true;
    } else if (input.right && !input.left) {
      session.isFacingLeft = false;
    }

    if (typeof input.flashlightOn === 'boolean') {
      session.flashlightOn = input.flashlightOn;
    }
  }

  public updatePlayerPhysicsAndFoW(dt: number): void {
    const grid = this.world.grid;
    for (const session of this.players.values()) {
      session.invulnerableSeconds = Math.max(0, session.invulnerableSeconds - dt);
      session.playerBody.processInputs(session.inputs, grid);
      session.playerBody.update(dt, grid);

      // Animation state determination
      if (session.isMining || session.inputs.miningKey) {
        session.animationState = 'mine';
      } else if (session.playerBody.isOnLadder) {
        session.animationState = Math.abs(session.playerBody.velocity.y) > 0.1 ? 'climb' : 'idle';
      } else if (!session.playerBody.isGrounded) {
        session.animationState = 'jump';
      } else if (Math.abs(session.playerBody.velocity.x) > 0.1) {
        session.animationState = 'walk';
      } else {
        session.animationState = 'idle';
      }

      // FoW reveal
      const currentGridPos = {
        x: Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.round(session.playerBody.position.x))),
        y: Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.round(session.playerBody.position.y))),
      };
      if (
        !session.lastRevealGridPos ||
        session.lastRevealGridPos.x !== currentGridPos.x ||
        session.lastRevealGridPos.y !== currentGridPos.y
      ) {
        session.lastRevealGridPos = { ...currentGridPos };
        this.world.revealAround(currentGridPos, session.visionRange);
      }

      // Item pickups
      this.world.drops.checkItemPickupsForPlayer(session);
    }
  }

  /** Melee: players whose swing fired this tick hit every living mob in their weapon's hit box. */
  public handleMeleeAttacks(): void {
    const grid = this.world.grid;
    for (const session of this.players.values()) {
      // Melee rides on the shared swing: one swing damages the block under the cursor (if any)
      // AND every mob in the weapon's hit box.
      if (!session.swungThisTick || session.weaponDamage <= 0) continue;

      const px = session.playerBody.position.x;
      const py = session.playerBody.position.y;

      let aimX = session.aimDirection?.x ?? (session.isFacingLeft ? -1 : 1);
      let aimY = session.aimDirection?.y ?? 0;
      const aimLen = Math.hypot(aimX, aimY);
      if (aimLen > 0.001) {
        aimX /= aimLen;
        aimY /= aimLen;
      } else {
        aimX = session.isFacingLeft ? -1 : 1;
        aimY = 0;
      }

      // Weapon position: shoulder pivot pushed out along the aim direction.
      // The aim direction already tracks the cursor angle, so the weapon (and hit box)
      // follows where the player is swinging regardless of how far the cursor is.
      const shoulderY = py - MINING_CONFIG.MELEE_SHOULDER_OFFSET_Y;
      const weaponX = px + aimX * MINING_CONFIG.MELEE_WEAPON_OFFSET;
      const weaponY = shoulderY + aimY * MINING_CONFIG.MELEE_WEAPON_OFFSET;
      const halfSize = MINING_CONFIG.MELEE_HIT_HALF_SIZE + MINING_CONFIG.MELEE_MOB_BODY_MARGIN;

      for (const mob of this.world.mobs.activeMobs.values()) {
        if (mob.health <= 0) continue;
        const mx = mob.mobBody.position.x;
        const my = mob.mobBody.position.y;

        // Box (AABB) around the weapon, slightly larger than the weapon itself
        if (Math.abs(mx - weaponX) > halfSize || Math.abs(my - weaponY) > halfSize) continue;

        // Solid tiles between the player and the mob shield it
        if (isObstructedBySolidTiles(grid, px, py, mx, my)) continue;

        const dx = mx - px;
        const kbDirX = Math.sign(dx) || Math.sign(aimX) || (session.isFacingLeft ? -1 : 1);
        this.world.damage.applyDamage({ kind: 'mob', id: mob.id }, {
          amount: session.weaponDamage,
          type: 'melee',
          source: { kind: 'player', id: session.characterId, name: session.characterName, position: { x: px, y: py } },
          knockback: knockbackImpulse(session.knockback, kbDirX > 0 ? 1 : -1),
        });
      }
    }
  }

  /**
   * Advances every player's swing timer and flags who swings this tick. The same swing is used
   * for block damage and melee, so a pickaxe or sword has one swing rate, whatever it hits.
   * Swinging needs the mining key held; the rate comes from the Mining Speed stat (baseline 25 =
   * 2 swings/s). The timer keeps counting while the key is up, so tapping can't beat holding.
   */
  public advanceSwings(dt: number): void {
    for (const session of this.players.values()) {
      session.swungThisTick = false;
      session.noticeCooldown = Math.max(0, session.noticeCooldown - dt);
      // Allow at most one tick of carried-over time so the long-run rate is exact
      session.swingCooldown = Math.max(-dt, session.swingCooldown - dt);

      if (!session.inputs.miningKey || session.swingCooldown > 0) continue;

      const speed = this.getMiningSpeed(session);
      const swingsPerSec = 2.0 * ((speed > 0 ? speed : 25) / 25);
      session.swungThisTick = true;
      session.swingCooldown += 1 / swingsPerSec;
    }
  }

  public getMiningSpeed(session: MiningPlayerSession): number {
    return typeof session.miningSpeed === 'function' ? session.miningSpeed() : (session.miningSpeed ?? 0);
  }

  /**
   * Tells a player something about their tool (e.g. it is too weak for a block), at most once
   * every few seconds so holding the mouse button doesn't spam them.
   */
  public sendNotice(session: MiningPlayerSession, kind: 'tool_too_weak', message: string): void {
    if (session.noticeCooldown > 0) return;
    session.noticeCooldown = MINING_CONFIG.TOOL_NOTICE_COOLDOWN_SECONDS;
    if (session.socket && session.socket.connected) {
      session.socket.emit('mining_notice', { kind, message });
    }
  }

  /**
   * Applies damage to a player. Ignored while dead or invulnerable (the grace window after a hit).
   * The caller handles knockback, notification and what happens on death.
   */
  public damagePlayer(
    session: MiningPlayerSession | undefined,
    amount: number
  ): { applied: boolean; died: boolean } {
    if (!session || session.isDead || session.invulnerableSeconds > 0) {
      return { applied: false, died: false };
    }
    if (!Number.isFinite(amount) || amount <= 0) return { applied: false, died: false };

    session.health = Math.max(0, session.health - amount);
    session.invulnerableSeconds = MINING_CONFIG.PLAYER_HIT_INVULNERABILITY;
    if (session.health <= 0) {
      session.isDead = true;
      return { applied: true, died: true };
    }
    return { applied: true, died: false };
  }

  public increaseVisionRange(characterId: string, amount: number = 1): number {
    const session = this.players.get(characterId);
    if (!session) return MINING_CONFIG.DEFAULT_VISION_RANGE;
    if (!Number.isInteger(amount)) return session.visionRange;
    session.visionRange = Math.min(
      MINING_CONFIG.MAX_VISION_RANGE,
      Math.max(0, session.visionRange + amount)
    );
    session.lastRevealGridPos = null;
    return session.visionRange;
  }

  public setMiningSpeed(characterId: string, speed: number | (() => number)): void {
    const session = this.players.get(characterId);
    if (session) {
      session.miningSpeed = speed;
      const currentSpeed = typeof speed === 'function' ? speed() : speed;
      if (currentSpeed === 0 && session.isMining) {
        session.isMining = false;
        session.miningTarget = null;
        session.miningProgressMs = 0;
      }
    }
  }

  /** Replaces the live equipment-derived stats after the character equips/unequips gear. */
  public setLoadout(
    characterId: string,
    loadout: {
      miningSpeed: number;
      gearLayers: MiningGearLayer[];
      equippedWeaponId: string | null;
    } & MiningCombatStats
  ): void {
    const session = this.players.get(characterId);
    if (!session) return;
    this.setMiningSpeed(characterId, loadout.miningSpeed);
    session.toolDamage = loadout.toolDamage;
    session.weaponDamage = loadout.weaponDamage;
    session.pickPower = loadout.pickPower;
    session.knockback = loadout.knockback;
    this.updateGear(session, loadout.gearLayers);
    session.equippedWeaponId = loadout.equippedWeaponId;
  }

  private updateGear(session: MiningPlayerSession, gearLayers: MiningGearLayer[]): void {
    if (JSON.stringify(gearLayers) !== JSON.stringify(session.gearLayers)) {
      session.gearVersion++;
    }
    session.gearLayers = gearLayers;
  }

  public setSocket(characterId: string, socket: Socket): void {
    const session = this.players.get(characterId);
    if (session) {
      session.socket = socket;
    }
  }
}
