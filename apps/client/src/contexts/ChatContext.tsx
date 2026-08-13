import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { CombatLogMessage, ChatMessage } from '@mine-me/shared';
import { useGame } from './GameContext';
import { useSocket } from './SocketContext';

interface ChatContextType {
  activeTab: 'City' | 'Combat';
  setActiveTab: (tab: 'City' | 'Combat') => void;
  cityLogs: ChatMessage[];
  combatLogs: CombatLogMessage[];
  clearCombatLogs: () => void;
  /**
   * Manually add combat log messages. Used by CombatView to push logs
   * at precise moments during the animation sequence, synchronized
   * with floating text and health bar updates.
   */
  addCombatLogs: (logs: CombatLogMessage[]) => void;
  sendCityMessage: (message: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeCity } = useGame();
  const { sendCityMessage: socketSendCityMessage, onEvent } = useSocket();
  const [activeTab, setActiveTab] = useState<'City' | 'Combat'>('City');
  const [cityLogs, setCityLogs] = useState<ChatMessage[]>([]);
  const [combatLogs, setCombatLogs] = useState<CombatLogMessage[]>([]);

  // Clear city logs when entering a new city
  useEffect(() => {
    setCityLogs([]);
  }, [activeCity?.id]);

  // Listen to socket city_message event
  useEffect(() => {
    const cleanup = onEvent('city_message', (msg: ChatMessage) => {
      setCityLogs(prev => [...prev, msg]);
    });
    return cleanup;
  }, [onEvent]);

  // Listen for combat_loot to push into the log as well
  useEffect(() => {
    const cleanup = onEvent('combat_loot', (loot: { sol: number; items: any[] }) => {
      const logs: CombatLogMessage[] = [];
      
      if (loot.sol > 0) {
        logs.push({
          id: Math.random().toString(36).substring(7),
          message: `Looted ${loot.sol} Sol.`,
          type: 'loot'
        });
      }

      for (const item of loot.items) {
        if (item.itemDetails) {
          logs.push({
            id: Math.random().toString(36).substring(7),
            message: `Looted ${item.quantity}x ${item.itemDetails.name}.`,
            type: 'loot'
          });
        }
      }

      if (logs.length > 0) {
        setCombatLogs(prev => [...prev, ...logs]);
      }
    });
    return cleanup;
  }, [onEvent]);

  /** Manually add combat logs at a specific moment during animation. */
  const addCombatLogs = useCallback((logs: CombatLogMessage[]) => {
    if (logs.length > 0) {
      setCombatLogs(prev => [...prev, ...logs]);
    }
  }, []);

  const clearCombatLogs = useCallback(() => {
    setCombatLogs([]);
  }, []);

  const sendCityMessage = useCallback(async (message: string) => {
    await socketSendCityMessage(message);
  }, [socketSendCityMessage]);

  return (
    <ChatContext.Provider value={{
      activeTab,
      setActiveTab,
      cityLogs,
      combatLogs,
      clearCombatLogs,
      addCombatLogs,
      sendCityMessage,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
