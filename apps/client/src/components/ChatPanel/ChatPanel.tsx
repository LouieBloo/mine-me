import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useGame } from '../../contexts/GameContext';
import { Virtuoso } from 'react-virtuoso';
import ScrollToBottom from 'react-scroll-to-bottom';
import TextareaAutosize from 'react-textarea-autosize';
import EmojiPicker from 'emoji-picker-react';
import './ChatPanel.css';

export const ChatPanel = () => {
  const { activeTab, setActiveTab, cityLogs, combatLogs, sendCityMessage } = useChat();
  const { playerState } = useGame();
  const currentCharacterName = playerState?.characterName;
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (inputText.trim() === '') return;
    if (inputText.trim().length > 1000) return;
    try {
      await sendCityMessage(inputText.trim());
      setInputText('');
      setShowEmojiPicker(false);
    } catch (err: any) {
      console.error('[ChatPanel] Failed to send message:', err);
    }
  }, [inputText, sendCityMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const onEmojiClick = (emojiData: { emoji: string }) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-sm w-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 bg-slate-900/60 shrink-0">
        <button
          onClick={() => setActiveTab('City')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
            activeTab === 'City'
              ? 'text-amber-500 border-b-2 border-amber-500 bg-slate-800/50'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
          }`}
        >
          City
        </button>
        <button
          onClick={() => setActiveTab('Combat')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
            activeTab === 'Combat'
              ? 'text-red-500 border-b-2 border-red-500 bg-slate-800/50'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
          }`}
        >
          Combat
        </button>
      </div>

      {/* Log Area */}
      <div className="flex-1 relative flex flex-col min-h-0">
        {activeTab === 'City' ? (
          cityLogs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 italic text-xs">
              Welcome to the city channel. No messages yet.
            </div>
          ) : (
            <Virtuoso
              data={cityLogs}
              followOutput="auto"
              className="flex-1 custom-scrollbar text-sm"
              style={{ height: '100%' }}
              components={{
                Header: () => <div className="h-4" />,
                Footer: () => <div className="h-4" />,
              }}
              itemContent={(_index, log) => {
                if (log.isSystem) {
                  return (
                    <div key={log.id} className="break-words py-1 px-4 text-slate-500 italic text-xs transition-colors">
                      <span className="text-[10px] mr-2 opacity-60">
                        [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]
                      </span>
                      <span>{log.message}</span>
                    </div>
                  );
                }

                const isOwnMessage = log.sender === currentCharacterName;
                const nameColorClass = isOwnMessage ? 'text-amber-400' : 'text-sky-400';

                return (
                  <div key={log.id} className="break-words py-1.5 px-4 hover:bg-slate-800/20 rounded transition-colors group">
                    <span className="text-slate-500 text-[10px] mr-2 opacity-60 group-hover:opacity-100 transition-opacity">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]
                    </span>
                    <span className={`${nameColorClass} font-black mr-2 tracking-wide`}>{log.sender}:</span>
                    <span className="text-slate-300 tracking-wide leading-relaxed">{log.message}</span>
                  </div>
                );
              }}
            />
          )
        ) : (
          <ScrollToBottom className="flex-1 overflow-y-auto p-4 custom-scrollbar text-sm">
            <div className="space-y-3">
              {combatLogs.length === 0 ? (
                <div className="text-slate-600 italic text-center text-xs mt-4">Combat logs will appear here.</div>
              ) : (
                combatLogs.map(log => {
                  let colorClass = 'text-slate-400';
                  if (log.type === 'damage') colorClass = 'text-red-400 font-semibold';
                  if (log.type === 'defense') colorClass = 'text-blue-400';
                  if (log.type === 'system') colorClass = 'text-yellow-500 font-black uppercase tracking-widest mt-6 mb-2 border-b border-slate-800 pb-1';
                  if (log.type === 'loot') colorClass = 'text-emerald-400 font-bold';

                  return (
                    <div key={log.id} className={`break-words ${colorClass}`}>
                      {log.message}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollToBottom>
        )}
      </div>

      {/* Input Area (City Only) */}
      {activeTab === 'City' && (
        <div className="p-3 bg-slate-900/85 border-t border-slate-700/50 shrink-0 relative flex flex-col gap-2">
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="absolute bottom-16 left-3 z-50 shadow-2xl rounded-xl overflow-hidden border border-slate-700">
              <EmojiPicker 
                theme={'dark' as any} 
                onEmojiClick={onEmojiClick}
                width={280}
                height={320}
              />
            </div>
          )}
          <div className="flex items-end gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 focus-within:border-amber-500/50 transition-all duration-300 shadow-inner">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(prev => !prev)}
              className="text-slate-500 hover:text-amber-500 transition-colors p-1 rounded-md hover:bg-slate-900/60 cursor-pointer"
              title="Add Emoji"
            >
              😀
            </button>
            <TextareaAutosize
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              maxRows={4}
              maxLength={1000}
              className="flex-1 bg-transparent border-0 p-0 text-sm text-slate-300 placeholder-slate-600 focus:ring-0 focus:outline-none resize-none min-h-[20px]"
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={inputText.trim() === ''}
              className={`p-1.5 rounded-md transition-all uppercase text-[10px] font-black tracking-widest cursor-pointer ${
                inputText.trim() === ''
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 active:scale-95'
              }`}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
