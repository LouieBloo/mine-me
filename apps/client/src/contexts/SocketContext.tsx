import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { socketService, type SocketEventMap } from '../services/socketService';
import { useAuth } from '../hooks/useAuth';
import { useGame } from './GameContext';
import type { PlayerState } from '@nvg/shared';

interface SocketContextType {
  isConnected: boolean;
  selectCharacter: (characterId: string) => Promise<void>;
  joinCity: (cityId: string, characterId: string) => Promise<void>;
  leaveCity: (cityId: string) => Promise<void>;
  /** Register a listener for a socket event. Returns a cleanup function. */
  onEvent: <K extends keyof SocketEventMap>(event: K, handler: (data: SocketEventMap[K]) => void) => () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const { setPlayerState, clearGameState, activeCharacter } = useGame();
  const [isConnected, setIsConnected] = useState(false);

  // Connect / disconnect based on auth token presence
  useEffect(() => {
    if (!token) {
      // Logged out — disconnect socket and clear all persisted game state
      if (socketService.isConnected) {
        socketService.disconnect();
        setIsConnected(false);
      }
      clearGameState();
      return;
    }

    // Connect and authenticate
    socketService.connect(token)
      .then(() => setIsConnected(true))
      .catch((err) => {
        console.error('[SocketContext] Failed to connect:', err.message);
        setIsConnected(false);
      });

    // Listen for disconnects (e.g. server restart)
    const handleDisconnect = () => setIsConnected(false);
    const handleReconnect = () => setIsConnected(true);

    socketService.on('disconnect', handleDisconnect as any);
    socketService.on('connect', handleReconnect as any);

    return () => {
      socketService.off('disconnect', handleDisconnect as any);
      socketService.off('connect', handleReconnect as any);
    };
  }, [token]);

  // Listen for character_state pushed by the server.
  // This is the central place where socket state feeds into GameContext.
  useEffect(() => {
    const handleCharacterState = (state: PlayerState) => {
      console.log('[SocketContext] character_state received:', state.characterName);
      setPlayerState(state);
    };
    socketService.on('character_state', handleCharacterState);
    return () => {
      socketService.off('character_state', handleCharacterState);
    };
  }, [setPlayerState]);

  // Auto-select character on connect or when activeCharacter changes.
  // This ensures that right after a page reload, the client fetches the latest player state (including inventory) mapping over the socket.
  useEffect(() => {
    if (isConnected && activeCharacter) {
      socketService.selectCharacter(activeCharacter.id)
        .catch(err => console.error('[SocketContext] Auto select_character failed:', err));
    }
  }, [isConnected, activeCharacter?.id]);

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

  return (
    <SocketContext.Provider value={{ isConnected, selectCharacter, joinCity, leaveCity, onEvent }}>
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
