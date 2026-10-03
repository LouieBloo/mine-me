import { Socket } from 'socket.io';
import {
  MINING_CONFIG,
  type MiningBackpackItem,
  type MiningGearLayer,
  type MiningInputState,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';
import { MiningPlayerBody } from '../physics/MiningPlayerBody';
import type { ServerMiningGrid } from '../../miningMap.service';

export interface MiningPlayerSession {
  characterId: string;
  characterName: string;
  socket: Socket;
  playerBody: MiningPlayerBody;
  inputs: MiningInputState;
  miningSpeed: number | (() => number);
  temporaryBackpack: MiningBackpackItem[];
  gearLayers: MiningGearLayer[];
  visionRange: number;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  miningProgressMs: number;
  miningTimeMs: number;
  isFacingLeft: boolean;
  aimDirection: Vector2D;
  flashlightOn: boolean;
  animationState: 'idle' | 'walk' | 'mine' | 'jump' | 'climb';
  lastRevealGridPos?: MiningPosition | null;
  backpackDirty?: boolean;
  lastAttackTimeMs?: number;
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
    gearLayers?: MiningGearLayer[];
  }): MiningPlayerSession {
    let session = this.players.get(options.characterId);
    if (session) {
      session.socket = options.socket;
      if (options.miningSpeed !== undefined) session.miningSpeed = options.miningSpeed;
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
    onDamageMob: (instanceId: string, damage: number, knockbackX: number, knockbackY: number) => void
  ): void {
    const nowMs = Date.now();
    const MELEE_SWING_REACH = 2.2;

    for (const session of this.players.values()) {
      if (session.inputs.miningKey) {
        if (!session.lastAttackTimeMs || nowMs - session.lastAttackTimeMs >= 400) {
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

          for (const mob of activeMobs) {
            if (mob.health <= 0) continue;
            const mx = mob.mobBody.position.x;
            const my = mob.mobBody.position.y;
            const dx = mx - px;
            const dy = my - py;
            const dist = Math.hypot(dx, dy);

            if (dist > MELEE_SWING_REACH) continue;

            const toMobX = dist > 0.001 ? dx / dist : aimX;
            const toMobY = dist > 0.001 ? dy / dist : aimY;
            const dot = aimX * toMobX + aimY * toMobY;

            const targetTileX = session.miningTarget?.x;
            const targetTileY = session.miningTarget?.y;
            const isNearTargetTile =
              targetTileX !== undefined &&
              targetTileY !== undefined &&
              Math.abs(mx - (targetTileX + 0.5)) <= 0.85 &&
              Math.abs(my - (targetTileY + 0.5)) <= 0.85;

            if (dot >= 0.30 || isNearTargetTile) {
              const kbDirX = Math.sign(dx) || Math.sign(aimX) || (session.isFacingLeft ? -1 : 1);
              onDamageMob(mob.id, 15, kbDirX * 4.5, -3.2);
            }
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
