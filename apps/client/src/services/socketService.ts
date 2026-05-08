import { io, Socket } from 'socket.io-client';
import type { PlayerState, GameCity, CharacterStatUpdate, GameEventPayload, GameEventResult, BattleState, CityDungeonInfo } from '@nvg/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// SocketService events emitted by the server that the client can listen for
export type SocketEventMap = {
  // Character state — emitted after select_character succeeds
  character_state: PlayerState;
  // Partial stat update — emitted whenever the server mutates character fields
  character_stat_update: CharacterStatUpdate;
  // City data — emitted after join_city succeeds (replaces HTTP /api/game/city/:id)
  city_data: GameCity;
  // Dungeon data — emitted after join_city with dungeon info + completion status
  city_dungeons: CityDungeonInfo;
  // Combat data
  battle_state: BattleState | null;
  combat_loot: { sol: number; items: { itemId: string; quantity: number; itemDetails?: any }[] };
  // City presence events
  player_entered_city: { characterId: string; name: string; level: number; combatScore: number };
  player_left_city: { characterId: string };
  // Connection
  connect: undefined;
  disconnect: string;
  connect_error: Error;
};

/**
 * Singleton service wrapping socket.io.
 * 
 * Lifecycle:
 *   1. `connect(token)` — Called when user authenticates. Connects and authenticates.
 *   2. `selectCharacter(characterId)` — Called when user enters the game with a character.
 *   3. `joinCity(cityId, characterId)` — Called when character loads into a city.
 *   4. `leaveCity(cityId)` — Called when character leaves a city.
 *   5. `disconnect()` — Called on logout.
 */
class SocketService {
  private socket: Socket | null = null;
  private joinedCityId: string | null = null;
  private listeners: { [event: string]: Function[] } = {};

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get instance(): Socket | null {
    return this.socket;
  }

  /**
   * Connect and authenticate the socket using the user's JWT.
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Already fully connected — nothing to do.
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // Socket instance exists but is still connecting (e.g. Strict Mode second mount).
      // Attach to the in-flight attempt instead of creating a second socket.
      if (this.socket) {
        this.socket.once('connect', () => resolve());
        this.socket.once('connect_error', reject);
        return;
      }

      // Fresh connect.
      this.socket = io(API_URL, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      // Re-attach any listeners that were registered before the socket was (re)created
      for (const [event, handlers] of Object.entries(this.listeners)) {
        for (const handler of handlers) {
          this.socket.on(event, handler as any);
        }
      }

      this.socket.once('connect', () => {
        console.log('[Socket] Connected:', this.socket?.id);
        resolve();
      });

      this.socket.once('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Join the character-scoped personal room.
   * Called once per game session when entering the game.
   */
  selectCharacter(characterId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));

      this.socket.emit('select_character', characterId, (res: { success?: boolean; error?: string }) => {
        if (res?.error) {
          reject(new Error(res.error));
        } else {
          console.log(`[Socket] Character room joined: character:${characterId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Join a city room. Triggers server-side validation that the character is in that city.
   */
  joinCity(cityId: string, characterId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));

      // Idempotency: Don't join the same room twice
      if (this.joinedCityId === cityId && this.socket.connected) {
        console.log(`[Socket] Already in city:${cityId}, skipping join`);
        return resolve();
      }

      this.socket.emit('join_city', cityId, characterId, (res: { success?: boolean; error?: string }) => {
        if (res?.error) {
          reject(new Error(res.error));
        } else {
          this.joinedCityId = cityId;
          console.log(`[Socket] City room joined: city:${cityId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Leave a city room.
   */
  leaveCity(cityId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));

      // Only leave if we think we are in that city
      if (this.joinedCityId !== cityId) {
        return resolve();
      }

      // Clear immediately to prevent race conditions in React StrictMode
      // (where a fast unmount/mount cycle might trigger leave -> join before the leave callback returns)
      this.joinedCityId = null;

      this.socket.emit('leave_city', cityId, (res: { success?: boolean; error?: string }) => {
        if (res?.error) {
          reject(new Error(res.error));
        } else {
          console.log(`[Socket] City room left: city:${cityId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Send a typed game event to the server.
   * Uses the discriminated union pattern — the server dispatches based on payload.type.
   */
  sendGameEvent(payload: GameEventPayload): Promise<GameEventResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));

      this.socket.emit('game_event', payload, (result: GameEventResult) => {
        if (result?.success) {
          resolve(result);
        } else {
          reject(new Error(result?.error || 'Game event failed'));
        }
      });
    });
  }

  /**
   * Register a listener for a server event.
   */
  on<K extends keyof SocketEventMap>(event: K, handler: (data: SocketEventMap[K]) => void): void {
    if (!this.listeners[event as string]) {
      this.listeners[event as string] = [];
    }
    this.listeners[event as string].push(handler);
    this.socket?.on(event as string, handler as any);
  }

  /**
   * Unregister a listener.
   */
  off<K extends keyof SocketEventMap>(event: K, handler: (data: SocketEventMap[K]) => void): void {
    if (this.listeners[event as string]) {
      this.listeners[event as string] = this.listeners[event as string].filter(h => h !== handler);
    }
    this.socket?.off(event as string, handler as any);
  }

  /**
   * Disconnect from server. Call on logout.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.joinedCityId = null;
      console.log('[Socket] Disconnected');
    }
  }
}

// Export as a singleton — one socket per app session
export const socketService = new SocketService();
