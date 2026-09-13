import { Socket } from 'socket.io';
import { MiningGameEngine } from './MiningGameEngine';
import { prisma } from '../../index';
import { InventoryService } from '../inventory.service';
import {
  type MiningSessionClientState,
  type MiningRemotePlayer,
  type MiningGearLayer,
  MINING_CONFIG,
} from '@mine-me/shared';
import { toClientGrid } from '../miningMap.service';

export const DEFAULT_MULTIPLAYER_ROOM_ID = 'lobby_multiplayer_default';

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
    mode: 'singleplayer' | 'multiplayer' = 'singleplayer',
    characterName?: string,
    gearLayers?: MiningGearLayer[],
  ): MiningGameEngine {
    const targetRoomId = mode === 'multiplayer' ? DEFAULT_MULTIPLAYER_ROOM_ID : `solo_${characterId}`;
    const prevRoomId = this.playerToRoom.get(characterId);

    // If player is moving from a different room, leave the old room first
    if (prevRoomId && prevRoomId !== targetRoomId) {
      this.cancelSession(characterId);
    }

    let engine = this.activeRooms.get(targetRoomId);

    // If forceNew is requested for solo mode, destroy the old instance
    // For multiplayer, never destroy an active lobby while players are in it
    if (engine && (mode === 'singleplayer' ? forceNew : engine.playerCount === 0)) {
      engine.stop();
      this.activeRooms.delete(targetRoomId);
      engine = undefined;
    }

    if (!engine) {
      engine = new MiningGameEngine({
        roomId: targetRoomId,
        gameMode: mode,
        cityId,
        onTimeout: (roomId) => {
          this.cleanupRoom(roomId);
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
      gearLayers,
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
  public buildClientState(engine: MiningGameEngine, characterId?: string): MiningSessionClientState {
    const session = characterId ? engine.getPlayer(characterId) : engine.primarySession;
    const pos = session ? session.playerBody.position : engine.position;
    const isAtEntrance = Math.round(pos.x) === MINING_CONFIG.ENTRANCE_X && Math.round(pos.y) === MINING_CONFIG.ENTRANCE_Y;

    const otherPlayers: MiningRemotePlayer[] = [];
    if (characterId) {
      for (const other of engine.players.values()) {
        if (other.characterId === characterId) continue;
        otherPlayers.push({
          characterId: other.characterId,
          characterName: other.characterName,
          position: { x: other.playerBody.position.x, y: other.playerBody.position.y },
          velocity: { x: other.playerBody.velocity.x, y: other.playerBody.velocity.y },
          isMining: other.isMining,
          miningTarget: other.miningTarget || undefined,
          isFacingLeft: other.isFacingLeft,
          aimDirection: other.aimDirection,
          flashlightOn: other.flashlightOn,
          animationState: other.animationState,
          gearLayers: other.gearLayers,
        });
      }
    }

    return {
      grid: toClientGrid(engine.grid),
      position: {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      },
      droppedItems: engine.droppedItems,
      temporaryBackpack: session ? session.temporaryBackpack : engine.temporaryBackpack,
      visionRange: session ? session.visionRange : engine.visionRange,
      canExtract: isAtEntrance,
      isMining: session ? session.isMining : engine.isMining,
      miningTarget: (session ? session.miningTarget : engine.miningTarget) || undefined,
      miningTimeMs: (session ? session.miningTimeMs : engine.miningTimeMs) || undefined,
      gameMode: engine.gameMode,
      otherPlayers: otherPlayers.length > 0 ? otherPlayers : undefined,
      activeDynamites: engine.activeDynamites.length > 0
        ? engine.activeDynamites.map((d) => ({
            id: d.id,
            position: { x: d.position.x, y: d.position.y },
            velocity: { x: d.velocity.x, y: d.velocity.y },
            fuseRemainingSeconds: d.fuseRemainingSeconds,
          }))
        : undefined,
    };
  }

  /**
   * End session and persist temporary loot to character inventory via Prisma.
   */
  public async endSession(characterId: string): Promise<{ extractedItems: any[] }> {
    const roomId = this.playerToRoom.get(characterId);
    if (!roomId) {
      return { extractedItems: [] };
    }

    const engine = this.activeRooms.get(roomId);
    if (!engine) {
      this.playerToRoom.delete(characterId);
      return { extractedItems: [] };
    }

    const removeResult = engine.removePlayer(characterId);
    this.playerToRoom.delete(characterId);

    // If room is now empty, stop and clean it up so future sessions create a fresh instance
    if (engine.playerCount === 0) {
      engine.stop();
      this.activeRooms.delete(roomId);
    }

    const extractedItems = removeResult?.extractedItems ?? [];

    // Persist items to database via Prisma
    if (extractedItems.length > 0) {
      for (const item of extractedItems) {
        const dbItem = await prisma.item.findFirst({
          where: { name: item.itemName },
        });
        if (dbItem) {
          await InventoryService.giveItemToCharacter(characterId, dbItem.id, item.quantity);
        }
      }
    }

    return { extractedItems };
  }

  /**
   * Cancel and immediately leave an active session without saving lost loot.
   */
  public cancelSession(characterId: string): void {
    const roomId = this.playerToRoom.get(characterId);
    if (!roomId) return;

    const engine = this.activeRooms.get(roomId);
    if (engine) {
      engine.removePlayer(characterId);
      if (engine.playerCount === 0) {
        engine.stop();
        this.activeRooms.delete(roomId);
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
      for (const charId of engine.players.keys()) {
        this.playerToRoom.delete(charId);
      }
      this.activeRooms.delete(roomId);
    }
  }
}

export const miningSessionManager = MiningSessionManager.getInstance();
