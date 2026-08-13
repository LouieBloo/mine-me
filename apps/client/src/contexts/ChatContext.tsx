import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ChatMessage } from '@mine-me/shared';
import { useGame } from './GameContext';
import { useSocket } from './SocketContext';

interface ChatContextType {
  activeTab: 'City';
  setActiveTab: (tab: 'City') => void;
  cityLogs: ChatMessage[];
  sendCityMessage: (message: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeCity } = useGame();
  const { sendCityMessage: socketSendCityMessage, onEvent } = useSocket();
  const [activeTab, setActiveTab] = useState<'City'>('City');
  const [cityLogs, setCityLogs] = useState<ChatMessage[]>([]);

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

  const sendCityMessage = useCallback(async (message: string) => {
    await socketSendCityMessage(message);
  }, [socketSendCityMessage]);

  return (
    <ChatContext.Provider value={{
      activeTab,
      setActiveTab,
      cityLogs,
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
