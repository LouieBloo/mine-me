import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { socketService, type SocketEventMap } from '../services/socketService';
import { useAuth } from '../hooks/useAuth';
import { useGame } from './GameContext';
import { notificationService } from '../services/notificationService';
import type { PlayerState, CharacterStatUpdate, GameEventPayload, GameEventResult } from '@nvg/shared';

interface SocketContextType {
  isConnected: boolean;
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

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const { setPlayerState, applyStatUpdate, setBattleState, clearGameState, activeCharacter } = useGame();
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

  // Listen for partial stat updates pushed by the server.
  // These are lightweight deltas that get merged into the existing playerState.
  useEffect(() => {
    const handleStatUpdate = (updates: CharacterStatUpdate) => {
      console.log('[SocketContext] character_stat_update received:', updates);
      applyStatUpdate(updates);
    };
    socketService.on('character_stat_update', handleStatUpdate);
    return () => {
      socketService.off('character_stat_update', handleStatUpdate);
    };
  }, [applyStatUpdate]);

  // Listen for combat state pushed by the server.
  useEffect(() => {
    const handleBattleState = (state: any) => {
      console.log('[SocketContext] battle_state received:', state);
      setBattleState(state);
    };
    socketService.on('battle_state', handleBattleState);
    return () => {
      socketService.off('battle_state', handleBattleState);
    };
  }, [setBattleState]);

  // Listen for combat loot and trigger notifications
  useEffect(() => {
    const handleCombatLoot = (loot: { sol: number; experience: number; items: any[] }) => {
      console.log('[SocketContext] combat_loot received:', loot);
      
      if (loot.sol > 0) {
        notificationService.gold(loot.sol, 'SOL');
      }

      if (loot.experience > 0) {
        notificationService.xp(loot.experience);
      }

      for (const item of loot.items) {
        if (item.itemDetails) {
          notificationService.item(item.itemDetails, item.quantity);
        }
      }
    };
    
    socketService.on('combat_loot', handleCombatLoot);
    return () => {
      socketService.off('combat_loot', handleCombatLoot);
    };
  }, []);

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

  const sendCityMessage = useCallback((message: string) => {
    return socketService.sendCityMessage(message);
  }, []);

  const sendGameEvent = useCallback((payload: GameEventPayload) => {
    return socketService.sendGameEvent(payload);
  }, []);

  return (
    <SocketContext.Provider value={{ isConnected, selectCharacter, joinCity, leaveCity, sendCityMessage, sendGameEvent, onEvent }}>
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
