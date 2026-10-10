import { io, Socket } from 'socket.io-client';
import type { PlayerState, GameCity, CharacterStatUpdate, GameEventPayload, GameEventResult, ChatMessage, MiningStateTickPayload, MiningPlayerDamagedEvent, MiningSessionEndedEvent, MiningNoticeEvent } from '@mine-me/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// SocketService events emitted by the server that the client can listen for
export type SocketEventMap = {
  // Character state — emitted after select_character succeeds
  character_state: PlayerState;
  // Partial stat update — emitted whenever the server mutates character fields
  character_stat_update: CharacterStatUpdate;
  // City data — emitted after join_city succeeds (replaces HTTP /api/game/city/:id)
  city_data: GameCity;
  // City presence events
  player_entered_city: { characterId: string; name: string; combatScore: number };
  player_left_city: { characterId: string };
  // City chat events
  city_message: ChatMessage;
  // Real-time mining 30 Hz ticks
  mining_state_tick: MiningStateTickPayload;
  // Mining session timeout event (15 min limit reached)
  mining_session_timeout: { message?: string };
  // The server ended this player's run (e.g. they died in the mine)
  mining_session_ended: MiningSessionEndedEvent;
  // This player took damage in the mine (health itself arrives via character_stat_update)
  player_damaged: MiningPlayerDamagedEvent;
  // A short message about the player's tool/action (e.g. their pickaxe is too weak for a block)
  mining_notice: MiningNoticeEvent;
  // Connection
  connect: undefined;
  disconnect: string;
  connect_error: Error;
};

/** Error carrying whether the server itself rejected the request (vs. a network/timeout failure). */
export class SocketRequestError extends Error {
  readonly serverRejected: boolean;

  constructor(message: string, serverRejected: boolean) {
    super(message);
    this.name = 'SocketRequestError';
    this.serverRejected = serverRejected;
  }
}

/** How long to wait for the socket to be connected before an emit gives up. */
const CONNECT_WAIT_MS = 10000;
/** How long to wait for a server acknowledgement before an emit gives up. */
const ACK_TIMEOUT_MS = 15000;

/**
 * Singleton service wrapping socket.io.
 *
 * Lifecycle:
 *   1. `connect(token)` — Called when user authenticates. Connects and authenticates.
 *   2. `selectCharacter(characterId)` — Called when user enters the game with a character.
 *   3. `joinCity(cityId, characterId)` — Called when character loads into a city.
 *   4. `leaveCity(cityId)` — Called when character leaves a city.
 *   5. `disconnect()` — Called on logout.
 *
 * Every request waits for the connection first, so callers never race the connect. Per-connection
 * server state (selected character, joined city) is forgotten on every (re)connect because the
 * server loses it with the old socket.
 */
class SocketService {
  private socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private joinedCityId: string | null = null;
  private selectedCharacterId: string | null = null;
  private selectPromise: { characterId: string; promise: Promise<void> } | null = null;
  private listeners: { [event: string]: Function[] } = {};

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get instance(): Socket | null {
    return this.socket;
  }

  /**
   * Connect and authenticate the socket using the user's JWT.
   * Concurrent callers share one attempt; a failed attempt can be retried by calling again.
   */
  connect(token: string): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    // A socket left over from a failed attempt is still retrying on its own: reuse it
    const socket = this.socket ?? this.createSocket(token);

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        socket.off('connect_error', onError);
        this.connectPromise = null;
        resolve();
      };
      const onError = (err: Error) => {
        console.error('[Socket] Connection error:', err.message);
        socket.off('connect', onConnect);
        this.connectPromise = null;
        // Bad credentials never recover by retrying: drop the socket so a new token can connect fresh
        if (err.message.startsWith('Authentication error')) {
          this.disconnect();
        }
        reject(err);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });

    return this.connectPromise;
  }

  private createSocket(token: string): Socket {
    const socket = io(API_URL, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    // Re-attach any listeners that were registered before the socket was (re)created
    for (const [event, handlers] of Object.entries(this.listeners)) {
      for (const handler of handlers) {
        socket.on(event, handler as any);
      }
    }

    // The server forgets rooms and the selected character with the old socket
    socket.on('connect', () => {
      this.resetConnectionState();
      console.log('[Socket] Connected:', socket.id);
    });
    return socket;
  }

  private resetConnectionState(): void {
    this.joinedCityId = null;
    this.selectedCharacterId = null;
    this.selectPromise = null;
  }

  /** Resolves once the socket is connected; rejects if it doesn't connect in time. */
  whenConnected(timeoutMs: number = CONNECT_WAIT_MS): Promise<Socket> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new SocketRequestError('Not connected', false));
    if (socket.connected) return Promise.resolve(socket);

    return new Promise<Socket>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('connect', onConnect);
        reject(new SocketRequestError('Connection timed out', false));
      }, timeoutMs);
      const onConnect = () => {
        clearTimeout(timer);
        resolve(socket);
      };
      socket.once('connect', onConnect);
    });
  }

  /**
   * Emit an event and wait for the server's `{ error? }` acknowledgement, after the connection is up.
   * Rejects with `SocketRequestError` (`serverRejected` true when the server replied with an error).
   */
  private async request<T extends { error?: string }>(event: string, ...args: unknown[]): Promise<T> {
    const socket = await this.whenConnected();
    return new Promise<T>((resolve, reject) => {
      socket.timeout(ACK_TIMEOUT_MS).emit(event, ...args, (timeoutErr: Error | null, res: T) => {
        if (timeoutErr) {
          reject(new SocketRequestError(`${event} timed out`, false));
        } else if (res?.error) {
          reject(new SocketRequestError(res.error, true));
        } else {
          resolve(res);
        }
      });
    });
  }

  /**
   * Join the character-scoped personal room and receive the character's state.
   * Idempotent per connection: repeat calls for the same character share/skip the request.
   */
  selectCharacter(characterId: string): Promise<void> {
    if (this.selectedCharacterId === characterId && this.isConnected) return Promise.resolve();
    if (this.selectPromise?.characterId === characterId) return this.selectPromise.promise;

    const promise = this.request('select_character', characterId)
      .then(() => {
        this.selectedCharacterId = characterId;
        console.log(`[Socket] Character room joined: character:${characterId}`);
      })
      .finally(() => {
        if (this.selectPromise?.promise === promise) this.selectPromise = null;
      });
    this.selectPromise = { characterId, promise };
    return promise;
  }

  /**
   * Join a city room, leaving the previous one first. The server validates the character is in that city.
   */
  async joinCity(cityId: string, characterId: string): Promise<void> {
    if (this.joinedCityId === cityId && this.isConnected) return;

    if (this.joinedCityId && this.joinedCityId !== cityId) {
      await this.leaveCity(this.joinedCityId).catch(() => {});
    }

    await this.request('join_city', cityId, characterId);
    this.joinedCityId = cityId;
    console.log(`[Socket] City room joined: city:${cityId}`);
  }

  /**
   * Leave a city room.
   */
  async leaveCity(cityId: string): Promise<void> {
    // Only leave if we think we are in that city
    if (this.joinedCityId !== cityId || !this.isConnected) return;
    this.joinedCityId = null;
    await this.request('leave_city', cityId);
    console.log(`[Socket] City room left: city:${cityId}`);
  }

  /**
   * Send a city chat message.
   */
  async sendCityMessage(message: string): Promise<void> {
    await this.request('send_city_message', { message });
  }

  /**
   * Send a typed game event to the server.
   * Uses the discriminated union pattern — the server dispatches based on payload.type.
   */
  async sendGameEvent(payload: GameEventPayload): Promise<GameEventResult> {
    const socket = await this.whenConnected();
    return new Promise<GameEventResult>((resolve, reject) => {
      socket.timeout(ACK_TIMEOUT_MS).emit('game_event', payload, (timeoutErr: Error | null, result: GameEventResult) => {
        if (timeoutErr) {
          reject(new SocketRequestError('Game event timed out', false));
        } else if (result?.success) {
          resolve(result);
        } else {
          reject(new SocketRequestError(result?.error || 'Game event failed', true));
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
      this.connectPromise = null;
      this.resetConnectionState();
      console.log('[Socket] Disconnected');
    }
  }
}

// Export as a singleton — one socket per app session
export const socketService = new SocketService();
