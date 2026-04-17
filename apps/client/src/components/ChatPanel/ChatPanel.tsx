import { useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';

export const ChatPanel = () => {
  const { activeTab, setActiveTab, cityLogs, combatLogs } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cityLogs.length, combatLogs.length, activeTab]);

  return (
    <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-sm w-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 bg-slate-900/60 shrink-0">
        <button
          onClick={() => setActiveTab('City')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'City'
              ? 'text-amber-500 border-b-2 border-amber-500 bg-slate-800/50'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
          }`}
        >
          City
        </button>
        <button
          onClick={() => setActiveTab('Combat')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'Combat'
              ? 'text-red-500 border-b-2 border-red-500 bg-slate-800/50'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
          }`}
        >
          Combat
        </button>
      </div>

      {/* Log Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-sm"
      >
        {activeTab === 'City' ? (
          cityLogs.length === 0 ? (
            <div className="text-slate-600 italic text-center text-xs mt-4">Welcome to the city channel. No messages yet.</div>
          ) : (
            cityLogs.map(log => (
              <div key={log.id} className="break-words">
                <span className="text-slate-500 text-xs mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                <span className="text-amber-400 font-bold mr-2">{log.sender}:</span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))
          )
        ) : (
          combatLogs.length === 0 ? (
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
          )
        )}
      </div>

      {/* Input Area (City Only for now) */}
      {activeTab === 'City' && (
        <div className="p-3 bg-slate-900/80 border-t border-slate-700/50 shrink-0">
          <input 
            type="text" 
            disabled
            placeholder="Chat disabled..."
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600 cursor-not-allowed"
          />
        </div>
      )}
    </div>
  );
};
