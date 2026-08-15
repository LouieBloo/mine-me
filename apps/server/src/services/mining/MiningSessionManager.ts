import { Socket } from 'socket.io';
import { MiningGameEngine } from './MiningGameEngine';
import { prisma } from '../../index';
import { InventoryService } from '../inventory.service';
import type { MiningSessionClientState } from '@mine-me/shared';
import { toClientGrid } from '../miningMap.service';

export class MiningSessionManager {
  private static instance: MiningSessionManager;
  private activeSessions: Map<string, MiningGameEngine> = new Map();

  private constructor() {}

  public static getInstance(): MiningSessionManager {
    if (!MiningSessionManager.instance) {
      MiningSessionManager.instance = new MiningSessionManager();
    }
    return MiningSessionManager.instance;
  }

  /**
   * Create or retrieve an active real-time mining session.
   * If forceNew is true, any existing session for the character is stopped and replaced with a new map.
   */
  public createSession(characterId: string, cityId: string, socket: Socket, forceNew = false): MiningGameEngine {
    let engine = this.activeSessions.get(characterId);
    if (engine && forceNew) {
      engine.stop();
      this.activeSessions.delete(characterId);
      engine = undefined;
    }

    if (engine) {
      engine.setSocket(socket);
    } else {
      engine = new MiningGameEngine({
        characterId,
        cityId,
        socket,
        onTimeout: (charId) => {
          this.activeSessions.delete(charId);
        },
      });
      this.activeSessions.set(characterId, engine);
      engine.start();
    }
    return engine;
  }

  /**
   * Get an active mining engine by character ID.
   */
  public getSession(characterId: string): MiningGameEngine | undefined {
    return this.activeSessions.get(characterId);
  }

  /**
   * Build client-safe session state snapshot for initial connection.
   */
  public buildClientState(engine: MiningGameEngine): MiningSessionClientState {
    const isAtEntrance = Math.round(engine.position.x) === 15 && Math.round(engine.position.y) === 0;

    return {
      grid: toClientGrid(engine.grid),
      position: {
        x: Math.round(engine.position.x),
        y: Math.round(engine.position.y),
      },
      droppedItems: engine.droppedItems,
      temporaryBackpack: engine.temporaryBackpack,
      visionRange: engine.visionRange,
      canExtract: isAtEntrance,
      isMining: engine.isMining,
      miningTarget: engine.miningTarget || undefined,
      miningTimeMs: engine.miningTimeMs || undefined,
    };
  }

  /**
   * End session and persist temporary loot to character inventory via Prisma.
   */
  public async endSession(characterId: string): Promise<{ extractedItems: any[] }> {
    const engine = this.activeSessions.get(characterId);
    if (!engine) {
      return { extractedItems: [] };
    }

    // Stop 30 Hz simulation loop
    engine.stop();
    this.activeSessions.delete(characterId);

    const extractedItems = [...engine.temporaryBackpack];

    // Persist items to database via Prisma
    if (extractedItems.length > 0) {
      for (const item of extractedItems) {
        // Find DB item
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
   * Cancel and immediately stop an active session without saving lost loot.
   */
  public cancelSession(characterId: string): void {
    const engine = this.activeSessions.get(characterId);
    if (!engine) return;

    // Stop 30 Hz simulation loop and remove from active sessions map
    engine.stop();
    this.activeSessions.delete(characterId);
  }
}

export const miningSessionManager = MiningSessionManager.getInstance();
