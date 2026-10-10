import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { socketService, SocketRequestError, type SocketEventMap } from '../services/socketService';
import { notificationService } from '../services/notificationService';
import { useAuth } from '../hooks/useAuth';
import { useGame } from './GameContext';
import type { PlayerState, CharacterStatUpdate, GameEventPayload, GameEventResult } from '@mine-me/shared';

export type SessionStatus = 'idle' | 'connecting' | 'selecting' | 'joining' | 'ready' | 'error';

export interface SessionState {
  status: SessionStatus;
  /** Why the session failed (status 'error'). */
  error: string | null;
}

interface SocketContextType {
  isConnected: boolean;
  /**
   * Where the game session is: connecting -> selecting the character -> joining the city -> ready.
   * Game screens should wait for 'ready' before acting on server state.
   */
  session: SessionState;
  /** Re-run a failed session setup. */
  retrySession: () => void;
  selectCharacter: (characterId: string) => Promise<void>;
  joinCity: (cityId: string, characterId: string) => Promise<void>;
  leaveCity: (cityId: string) => Promise<void>;
  /** Send a city chat message to the server. */
  sendCityMessage: (message: string) => Promise<void>;
  /** Send a typed game event to the server. Returns the result. */
  sendGameEvent: (payload: GameEventPayload) => Promise<GameEventResult>;
  /** Register a listener for a socket event. Returns a cleanup function. */
  onEvent: <K extends keyof SocketEventMap>(event: K, handler: (data: SocketEventMap[K]) => void) => () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

/** Automatic attempts at selecting the character / joining the city before showing an error. */
export const SESSION_MAX_ATTEMPTS = 3;
const SESSION_RETRY_DELAY_MS = 800;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, logout } = useAuth();
  const { setPlayerState, applyStatUpdate, clearGameState, activeCharacter, setActiveCharacter } = useGame();
  const [isConnected, setIsConnected] = useState(false);
  // Bumped on every (re)connect so the session is rebuilt even if isConnected flips within one render
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [session, setSession] = useState<SessionState>({ status: 'idle', error: null });
  const [retryNonce, setRetryNonce] = useState(0);
  const latestCityIdRef = useRef<{ characterId: string; cityId: string } | null>(null);

  // Connect / disconnect based on auth token presence
  useEffect(() => {
    if (!token) {
      // Logged out — disconnect socket and clear all persisted game state
      if (socketService.instance) {
        socketService.disconnect();
        setIsConnected(false);
      }
      clearGameState();
      return;
    }

    let cancelled = false;

    const handleDisconnect = () => setIsConnected(false);
    const handleConnect = () => {
      setIsConnected(true);
      setConnectionEpoch((n) => n + 1);
    };
    // Registered before connecting so no connect event can be missed
    socketService.on('disconnect', handleDisconnect as any);
    socketService.on('connect', handleConnect as any);

    socketService.connect(token)
      .then(() => {
        if (!cancelled) setIsConnected(true);
      })
      .catch((err) => {
        console.error('[SocketContext] Failed to connect:', err.message);
        if (cancelled) return;
        setIsConnected(false);
        // The server rejected our credentials: this token is no good, so sign out
        if (String(err.message).startsWith('Authentication error')) logout();
      });

    return () => {
      cancelled = true;
      socketService.off('disconnect', handleDisconnect as any);
      socketService.off('connect', handleConnect as any);
    };
  }, [token]);

  // Listen for character_state pushed by the server.
  // This is the central place where socket state feeds into GameContext.
  useEffect(() => {
    const handleCharacterState = (state: PlayerState) => {
      console.log('[SocketContext] character_state received:', state.characterName);
      latestCityIdRef.current = { characterId: state.id, cityId: state.cityId };
      setPlayerState(state);
    };
    socketService.on('character_state', handleCharacterState);
    return () => {
      socketService.off('character_state', handleCharacterState);
    };
  }, [setPlayerState]);

  // Listen for partial stat updates pushed by the server.
  // These are lightweight deltas that get merged into the existing playerState.
  useEffect(() => {
    const handleStatUpdate = (updates: CharacterStatUpdate) => {
      console.log('[SocketContext] character_stat_update received:', updates);
      if (updates.cityId !== undefined && latestCityIdRef.current) {
        latestCityIdRef.current = { ...latestCityIdRef.current, cityId: updates.cityId };
      }
      applyStatUpdate(updates);
    };
    socketService.on('character_stat_update', handleStatUpdate);
    return () => {
      socketService.off('character_stat_update', handleStatUpdate);
    };
  }, [applyStatUpdate]);

  // Game session setup: select the character, then join its city, in order, cancel-safe.
  // Runs again whenever the connection, character or city changes (including after a reconnect,
  // because the server forgets both on a new socket).
  const characterId = activeCharacter?.id;
  const characterCityId = activeCharacter?.cityId;
  useEffect(() => {
    if (!token || !characterId) {
      setSession({ status: 'idle', error: null });
      return;
    }
    if (!isConnected) {
      setSession((prev) => (prev.status === 'connecting' ? prev : { status: 'connecting', error: null }));
      return;
    }

    let cancelled = false;

    const run = async () => {
      let lastError = 'Unknown error';
      for (let attempt = 0; attempt < SESSION_MAX_ATTEMPTS; attempt++) {
        try {
          setSession({ status: 'selecting', error: null });
          await socketService.selectCharacter(characterId);
          if (cancelled) return;

          if (characterCityId) {
            setSession({ status: 'joining', error: null });
            await socketService.joinCity(characterCityId, characterId);
            if (cancelled) return;
          }
          setSession({ status: 'ready', error: null });
          return;
        } catch (err: any) {
          if (cancelled) return;
          lastError = err?.message ?? lastError;
          console.error(`[SocketContext] Session setup failed (attempt ${attempt + 1}):`, lastError);

          const rejected = err instanceof SocketRequestError && err.serverRejected;
          if (rejected && handleRejection(err.message)) return;
          if (attempt < SESSION_MAX_ATTEMPTS - 1) await wait(SESSION_RETRY_DELAY_MS * (attempt + 1));
          if (cancelled) return;
        }
      }
      setSession({ status: 'error', error: lastError });
    };

    // Returns true when the failure was handled and retrying is pointless.
    const handleRejection = (message: string): boolean => {
      // Our stored copy of the character is behind the server (e.g. it travelled elsewhere): catch it up.
      // The effect re-runs with the corrected city.
      const known = latestCityIdRef.current;
      if (/not in this city/i.test(message) && activeCharacter && known?.characterId === characterId && known.cityId !== characterCityId) {
        setActiveCharacter({ ...activeCharacter, cityId: known.cityId });
        return true;
      }
      // The server says this character can't be used (deleted, retired, not ours): back to selection
      if (/not found|forbidden|only active/i.test(message) && !/not in this city/i.test(message)) {
        notificationService.error('Cannot enter game', message);
        setActiveCharacter(null);
        return true;
      }
      return false;
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, isConnected, connectionEpoch, characterId, characterCityId, retryNonce]);

  // Leave the city room when no character is active any more
  useEffect(() => {
    if (!characterId) {
      const city = latestCityIdRef.current?.cityId;
      if (city) socketService.leaveCity(city).catch(() => {});
      latestCityIdRef.current = null;
    }
  }, [characterId]);

  const retrySession = useCallback(() => setRetryNonce((n) => n + 1), []);

  const selectCharacter = useCallback((characterId: string) => {
    return socketService.selectCharacter(characterId);
  }, []);

  const joinCity = useCallback((cityId: string, characterId: string) => {
    return socketService.joinCity(cityId, characterId);
  }, []);

  const leaveCity = useCallback((cityId: string) => {
    return socketService.leaveCity(cityId);
  }, []);

  const onEvent = useCallback(<K extends keyof SocketEventMap>(
    event: K,
    handler: (data: SocketEventMap[K]) => void
  ) => {
    socketService.on(event, handler);
    return () => socketService.off(event, handler);
  }, []);

  const sendCityMessage = useCallback((message: string) => {
    return socketService.sendCityMessage(message);
  }, []);

  const sendGameEvent = useCallback((payload: GameEventPayload) => {
    return socketService.sendGameEvent(payload);
  }, []);

  const contextValue = useMemo(
    () => ({ isConnected, session, retrySession, selectCharacter, joinCity, leaveCity, sendCityMessage, sendGameEvent, onEvent }),
    [isConnected, session, retrySession, selectCharacter, joinCity, leaveCity, sendCityMessage, sendGameEvent, onEvent]
  );

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
