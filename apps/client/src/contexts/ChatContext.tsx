import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { socketService } from '../services/socketService';
import type { CombatLogMessage } from '@nvg/shared';

export interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: number;
}

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
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'City' | 'Combat'>('City');
  const [cityLogs] = useState<ChatMessage[]>([]); // setCityLogs removed for now
  const [combatLogs, setCombatLogs] = useState<CombatLogMessage[]>([]);

  // NOTE: We intentionally do NOT auto-push turnLogs from battle_state here.
  // CombatView is responsible for distributing turnLogs at the correct moments
  // during the animation sequence via addCombatLogs(). This keeps chat messages
  // synchronized with floating damage text and health bar updates.

  // Listen for combat_loot to push into the log as well
  useEffect(() => {
    const handleCombatLoot = (loot: { sol: number; items: any[] }) => {
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
    };
    
    socketService.on('combat_loot', handleCombatLoot);
    return () => {
      socketService.off('combat_loot', handleCombatLoot);
    };
  }, []);

  /** Manually add combat logs at a specific moment during animation. */
  const addCombatLogs = useCallback((logs: CombatLogMessage[]) => {
    if (logs.length > 0) {
      setCombatLogs(prev => [...prev, ...logs]);
    }
  }, []);

  const clearCombatLogs = useCallback(() => {
    setCombatLogs([]);
  }, []);

  return (
    <ChatContext.Provider value={{
      activeTab,
      setActiveTab,
      cityLogs,
      combatLogs,
      clearCombatLogs,
      addCombatLogs,
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
