import { Socket } from 'socket.io';
import { MiningGameEngine } from './MiningGameEngine';
import { prisma } from '../../index';
import { InventoryService } from '../inventory.service';
import { broadcastStatUpdate } from '../characterBroadcast';
import type { MiningPlayerSession } from './subsystems/MiningPlayerManager';
import {
  type MiningSessionClientState,
  type MiningRemotePlayer,
  type MiningCombatStats,
  type MiningGearLayer,
  type MiningBackpackItem,
  MINING_CONFIG,
  type MiningGameMode,
} from '@mine-me/shared';
import { MiningDataManager } from './subsystems/MiningDataManager';
import { toClientGrid } from '../miningMap.service';
import { getGameModeRules, roomIdFor } from './gameModeRules';
import { dynamiteDefinition, toRemotePlayer } from './MiningEntitySync';

export { DEFAULT_MULTIPLAYER_ROOM_ID } from './gameModeRules';

export class MiningSessionManager {
  private static instance: MiningSessionManager;
  private activeRooms: Map<string, MiningGameEngine> = new Map();
  private playerToRoom: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): MiningSessionManager {
    if (!MiningSessionManager.instance) {
      MiningSessionManager.instance = new MiningSessionManager();
    }
    return MiningSessionManager.instance;
  }

  /**
   * Create or retrieve an active real-time mining session.
   * If mode is 'multiplayer', all players are routed into the default shared lobby.
   * If mode is 'singleplayer', each player gets their own isolated room.
   */
  public createSession(
    characterId: string,
    cityId: string,
    socket: Socket,
    forceNew = false,
    miningSpeed = 0,
    mode: MiningGameMode = 'singleplayer',
    characterName?: string,
    gearLayers?: MiningGearLayer[],
    mapConfig?: Partial<import('@mine-me/shared').MiningMapConfigData>,
    combat: Partial<MiningCombatStats> = {},
    equippedWeaponId: string | null = null,
    maxHealth?: number,
  ): MiningGameEngine {
    const rules = getGameModeRules(mode);
    const targetRoomId = roomIdFor(mode, characterId);
    const prevRoomId = this.playerToRoom.get(characterId);

    // If player is moving from a different room, leave the old room first
    if (prevRoomId && prevRoomId !== targetRoomId) {
      this.cancelSession(characterId);
    }

    let engine = this.activeRooms.get(targetRoomId);

    // If forceNew is requested for solo mode, destroy the old instance
    // For multiplayer, never destroy an active lobby while players are in it
    if (engine && (rules.restartsOnEntry ? forceNew : engine.playerCount === 0)) {
      engine.stop();
      this.activeRooms.delete(targetRoomId);
      engine = undefined;
    }

    if (!engine) {
      engine = new MiningGameEngine({
        roomId: targetRoomId,
        gameMode: mode,
        cityId,
        mapConfig,
        onTimeout: (roomId) => {
          this.cleanupRoom(roomId);
        },
        onFatalError: (roomId) => {
          this.cleanupRoom(roomId);
        },
        // Keep the app's health bar in step with damage taken in the mine
        // (not in modes that do not save to the character: damage there must not touch the real health bar)
        onPlayerHealthChanged: rules.persistsCharacter
          ? (characterId, health) => {
              broadcastStatUpdate(characterId, { health: Math.max(0, Math.round(health)) });
            }
          : undefined,
        onPlayerDeath: (characterId) => {
          this.handlePlayerDeath(characterId);
        },
        onRoomEmpty: (roomId) => {
          this.cleanupRoom(roomId);
        },
      });
      this.activeRooms.set(targetRoomId, engine);
      engine.start();
    }

    // Add or reconnect the player in the room
    engine.addPlayer({
      characterId,
      characterName,
      socket,
      miningSpeed,
      ...combat,
      gearLayers,
      equippedWeaponId,
      maxHealth,
    });

    this.playerToRoom.set(characterId, targetRoomId);
    return engine;
  }

  /**
   * Get an active mining engine by character ID.
   */
  public getSession(characterId: string): MiningGameEngine | undefined {
    const roomId = this.playerToRoom.get(characterId) ?? `solo_${characterId}`;
    return this.activeRooms.get(roomId);
  }

  /**
   * Get the room ID a character is currently in.
   */
  public getPlayerRoomId(characterId: string): string | undefined {
    return this.playerToRoom.get(characterId);
  }

  /**
   * Build client-safe session state snapshot for initial connection.
   */
  public buildClientState(engine: MiningGameEngine, characterId: string): MiningSessionClientState {
    const session = engine.getPlayer(characterId);
    if (!session) throw new Error(`Player ${characterId} is not in this mining room.`);
    const pos = session.playerBody.position;
    const isAtEntrance = Math.round(pos.x) === MINING_CONFIG.ENTRANCE_X && Math.round(pos.y) - engine.surfaceRow === MINING_CONFIG.ENTRANCE_Y;

    const otherPlayers: MiningRemotePlayer[] = [];
    for (const other of engine.players.values()) {
      if (other.characterId !== characterId) otherPlayers.push(toRemotePlayer(other));
    }

    const activeMobs = engine.getActiveMobs();

    return {
      grid: toClientGrid(engine.grid),
      fluids: engine.fluidSubsystem.clientDefinitions(),
      fluidCells: engine.fluidSubsystem.visibleSnapshot(),
      gases: engine.gasSubsystem.clientDefinitions(),
      gasCells: engine.gasSubsystem.visibleSnapshot(),
      fireCells: engine.fireSubsystem.visibleSnapshot(),
      blockFlames: engine.fluidSubsystem.blockFlameDefinitions(),
      burningEffect: MiningDataManager.getInstance().getParticleEffect(engine.mapConfig?.burningEffectId)?.config ?? null,
      position: {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      },
      droppedItems: engine.droppedItems,
      temporaryBackpack: session.temporaryBackpack,
      visionRange: session.visionRange,
      canExtract: isAtEntrance,
      isMining: session.isMining,
      miningTarget: session.miningTarget || undefined,
      miningTotal: session.miningTotal || undefined,
      gameMode: engine.gameMode,
      surfaceRow: engine.surfaceRow || undefined,
      sandbox: engine.sandbox
        ? { mobs: engine.sandbox.mobOptions(), status: engine.sandbox.status(characterId) }
        : undefined,
      otherPlayers,
      activeDynamites: engine.activeDynamites.length > 0 ? engine.activeDynamites.map(dynamiteDefinition) : undefined,
      mobs: activeMobs,
      characterSounds: MiningDataManager.getInstance().getCharacterSounds(),
    };
  }

  /**
   * Resets a sandbox room to its starting state and tells everyone in it, handing each client a
   * fresh full state to rebuild their view from. Returns false if the character is not in a sandbox.
   */
  public resetSandbox(characterId: string): boolean {
    const engine = this.getSession(characterId);
    if (!engine?.sandbox || !engine.getPlayer(characterId)) return false;
    engine.sandbox.reset();
    for (const [id, session] of engine.players) {
      if (session.socket?.connected) {
        session.socket.emit('mining_sandbox_reset', { sessionState: this.buildClientState(engine, id) });
      }
    }
    return true;
  }

  /** Health a character keeps when a run ends: dying leaves 1 HP, otherwise at least 1. */
  private static finalHealth(session: MiningPlayerSession | undefined): number | null {
    if (!session) return null;
    return session.isDead ? 1 : Math.max(1, Math.round(session.health));
  }

  /**
   * Writes a run's final health back to the character (and the app's health bar).
   * Failures are logged; they never block leaving the mine.
   */
  private async persistHealth(characterId: string, health: number | null): Promise<void> {
    if (health === null) return;
    try {
      await prisma.character.update({ where: { id: characterId }, data: { health } });
      broadcastStatUpdate(characterId, { health });
    } catch (err) {
      console.error(`[Mining] Failed to persist health (${health}) for ${characterId}:`, err);
    }
  }

  /**
   * A player died: the run ends, their backpack is lost, and they are left with 1 HP.
   * (The engine has already told the client.)
   */
  private handlePlayerDeath(characterId: string): void {
    const roomId = this.playerToRoom.get(characterId);
    const engine = roomId ? this.activeRooms.get(roomId) : undefined;
    const health = MiningSessionManager.finalHealth(engine?.getPlayer(characterId));
    this.cancelSession(characterId, { persistHealth: false });
    void this.persistHealth(characterId, health ?? 1);
  }

  /**
   * End session and persist temporary loot to character inventory via Prisma.
   */
  public async endSession(characterId: string): Promise<{ extractedItems: MiningBackpackItem[] }> {
    const roomId = this.playerToRoom.get(characterId);
    if (!roomId) {
      return { extractedItems: [] };
    }

    const engine = this.activeRooms.get(roomId);
    if (!engine) {
      this.playerToRoom.delete(characterId);
      return { extractedItems: [] };
    }

    const finalHealth = MiningSessionManager.finalHealth(engine.getPlayer(characterId));
    const removeResult = engine.removePlayer(characterId);
    this.playerToRoom.delete(characterId);

    // If room is now empty, stop and clean it up so future sessions create a fresh instance
    if (engine.playerCount === 0) {
      engine.stop();
      this.activeRooms.delete(roomId);
    }

    // A mode that does not save to the character (the sandbox) leaves loot and health behind
    if (!engine.rules.persistsCharacter) return { extractedItems: [] };

    const extractedItems = removeResult?.extractedItems ?? [];

    await this.persistHealth(characterId, finalHealth);

    // Persist items to database via Prisma in a single transaction (matched by item ID only)
    if (extractedItems.length > 0) {
      const { skipped } = await InventoryService.giveItemsToCharacter(
        characterId,
        extractedItems.map((i) => ({ itemId: i.itemId, quantity: i.quantity }))
      );
      for (const s of skipped) {
        console.warn(
          `[Mining] Could not save extracted item ${s.itemId} x${s.quantity} for ${characterId}: ${s.reason}`
        );
      }
    }

    return { extractedItems };
  }

  /**
   * Cancel and immediately leave an active session without saving lost loot.
   */
  public cancelSession(characterId: string, options: { persistHealth?: boolean } = {}): void {
    const roomId = this.playerToRoom.get(characterId);
    if (!roomId) return;

    const engine = this.activeRooms.get(roomId);
    if (engine) {
      const finalHealth = MiningSessionManager.finalHealth(engine.getPlayer(characterId));
      engine.removePlayer(characterId);
      if (engine.playerCount === 0) {
        engine.stop();
        this.activeRooms.delete(roomId);
      }
      if (options.persistHealth !== false && engine.rules.persistsCharacter) {
        void this.persistHealth(characterId, finalHealth);
      }
    }
    this.playerToRoom.delete(characterId);
  }

  /**
   * Completely shut down and clean up a room.
   */
  public cleanupRoom(roomId: string): void {
    const engine = this.activeRooms.get(roomId);
    if (engine) {
      engine.stop();
      for (const [charId, session] of engine.players) {
        if (engine.rules.persistsCharacter) {
          void this.persistHealth(charId, MiningSessionManager.finalHealth(session));
        }
        this.playerToRoom.delete(charId);
      }
      this.activeRooms.delete(roomId);
    }
  }
}

export const miningSessionManager = MiningSessionManager.getInstance();
