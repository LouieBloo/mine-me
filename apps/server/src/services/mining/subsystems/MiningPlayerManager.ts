import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  isTileSolid,
  type MiningBackpackItem,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';
import { MiningPlayerBody } from '../physics/MiningPlayerBody';
import { isInBounds, type ServerMiningGrid } from '../../miningMap.service';

export interface MiningPlayerSession {
  characterId: string;
  characterName: string;
  socket: Socket;
  playerBody: MiningPlayerBody;
  inputs: MiningInputState;
  miningSpeed: number | (() => number);
  miningDamage: number | (() => number);
  temporaryBackpack: MiningBackpackItem[];
  gearLayers: MiningGearLayer[];
  visionRange: number;
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
  lastAttackTimeMs?: number;
  swingTimer?: number;
  lastSwingAtMs?: number;
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
  public primaryCharacterId: string = '';

  constructor(primaryCharacterId: string = '') {
    this.primaryCharacterId = primaryCharacterId;
  }

  public get playerCount(): number {
    return this.players.size;
  }

  public get primarySession(): MiningPlayerSession | undefined {
    return this.players.get(this.primaryCharacterId);
  }

  public getPlayer(characterId: string): MiningPlayerSession | undefined {
    return this.players.get(characterId);
  }

  public addPlayer(options: {
    characterId: string;
    characterName?: string;
    socket: Socket;
    miningSpeed?: number | (() => number);
    miningDamage?: number | (() => number);
    gearLayers?: MiningGearLayer[];
  }): MiningPlayerSession {
    let session = this.players.get(options.characterId);
    if (session) {
      session.socket = options.socket;
      if (options.miningSpeed !== undefined) session.miningSpeed = options.miningSpeed;
      if (options.miningDamage !== undefined) session.miningDamage = options.miningDamage;
      if (options.gearLayers !== undefined) session.gearLayers = options.gearLayers;
      if (options.characterName) session.characterName = options.characterName;
      return session;
    }

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
      miningDamage: options.miningDamage ?? 25,
      temporaryBackpack: [],
      gearLayers: options.gearLayers || [],
      visionRange: MINING_CONFIG.DEFAULT_VISION_RANGE,
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

    if (!this.primaryCharacterId) {
      this.primaryCharacterId = options.characterId;
    }

    return session;
  }

  public removePlayer(characterId: string): { extractedItems: MiningBackpackItem[] } | null {
    const session = this.players.get(characterId);
    if (!session) return null;

    const extracted = [...session.temporaryBackpack];
    this.players.delete(characterId);

    if (this.primaryCharacterId === characterId) {
      const remaining = this.players.keys().next();
      this.primaryCharacterId = remaining.done ? '' : remaining.value;
    }

    return { extractedItems: extracted };
  }

  public handleInput(
    characterIdOrInput: string | MiningInputState,
    maybeInput?: MiningInputState
  ): void {
    let characterId: string;
    let input: MiningInputState;

    if (typeof characterIdOrInput === 'string') {
      characterId = characterIdOrInput;
      input = maybeInput!;
    } else {
      characterId = this.primaryCharacterId;
      input = characterIdOrInput;
    }

    const session = this.players.get(characterId);
    if (!session || !input) return;

    session.inputs = { ...input };

    if (input.aimDirection && typeof input.aimDirection.x === 'number' && typeof input.aimDirection.y === 'number') {
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

  public updatePlayerPhysicsAndFoW(
    dt: number,
    grid: ServerMiningGrid,
    revealCallback: (position: MiningPosition, visionRange: number) => void,
    pickupCallback: (session: MiningPlayerSession) => void
  ): void {
    for (const session of this.players.values()) {
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
        revealCallback(currentGridPos, session.visionRange);
      }

      // Item pickups
      pickupCallback(session);
    }
  }

  public handleMeleeAttacks(
    activeMobs: Iterable<{ id: string; health: number; mobBody: any }>,
    gridOrOnDamage:
      | ServerMiningGrid
      | ((instanceId: string, damage: number, knockbackX: number, knockbackY: number) => void)
      | undefined,
    maybeOnDamage?: (instanceId: string, damage: number, knockbackX: number, knockbackY: number) => void
  ): void {
    let grid: ServerMiningGrid | undefined;
    let onDamageMob: (instanceId: string, damage: number, knockbackX: number, knockbackY: number) => void;

    if (typeof gridOrOnDamage === 'function') {
      onDamageMob = gridOrOnDamage;
      grid = undefined;
    } else {
      grid = gridOrOnDamage;
      onDamageMob = maybeOnDamage!;
    }

    if (!onDamageMob) return;

    const nowMs = Date.now();

    for (const session of this.players.values()) {
      if (session.inputs.miningKey) {
        // Dynamic attack rate based on player's equipped weapon speed (baseline 25 = 2.0 swings/sec)
        const playerSpeed =
          typeof session.miningSpeed === 'function' ? session.miningSpeed() : (session.miningSpeed ?? 25);
        const swingsPerSec = 2.0 * ((playerSpeed || 25) / 25);
        const attackCooldownMs = Math.max(80, (1 / swingsPerSec) * 1000);

        if (!session.lastAttackTimeMs || nowMs - session.lastAttackTimeMs >= attackCooldownMs) {
          session.lastAttackTimeMs = nowMs;

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

          const damage =
            typeof session.miningDamage === 'function' ? session.miningDamage() : (session.miningDamage ?? 25);

          for (const mob of activeMobs) {
            if (mob.health <= 0) continue;
            const mx = mob.mobBody.position.x;
            const my = mob.mobBody.position.y;

            // Box (AABB) around the weapon, slightly larger than the weapon itself
            if (Math.abs(mx - weaponX) > halfSize || Math.abs(my - weaponY) > halfSize) continue;

            // Solid tiles between the player and the mob shield it
            if (grid && isObstructedBySolidTiles(grid, px, py, mx, my)) continue;

            const dx = mx - px;
            const kbDirX = Math.sign(dx) || Math.sign(aimX) || (session.isFacingLeft ? -1 : 1);
            onDamageMob(mob.id, damage, kbDirX * 4.5, -3.2);
          }
        }
      }
    }
  }

  public increaseVisionRange(characterId?: string, amount: number = 1): number {
    const targetId = characterId || this.primaryCharacterId;
    const session = this.players.get(targetId);
    if (!session) return MINING_CONFIG.DEFAULT_VISION_RANGE;
    session.visionRange += amount;
    session.lastRevealGridPos = null;
    return session.visionRange;
  }

  public setMiningSpeed(speed: number | (() => number), characterId?: string): void {
    const targetId = characterId || this.primaryCharacterId;
    const session = this.players.get(targetId);
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

  public setSocket(socket: Socket, characterId?: string): void {
    const targetId = characterId || this.primaryCharacterId;
    const session = this.players.get(targetId);
    if (session) {
      session.socket = socket;
    }
  }
}
