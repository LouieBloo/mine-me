import { useState } from 'react';
import { ChatPanel } from '../ChatPanel/ChatPanel';

/**
 * The city chat as a small see-through window in the bottom-left corner of the game (instead of a sidebar), that can be
 * folded down to just its title bar.
 */
export const ChatOverlay = () => {
  const [folded, setFolded] = useState(false);

  return (
    <div className="chat-overlay absolute bottom-24 left-6 z-30 flex w-96 flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/55 shadow-xl backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setFolded((f) => !f)}
        aria-expanded={!folded}
        className="flex w-full shrink-0 cursor-pointer items-center justify-between bg-slate-900/70 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-400"
      >
        <span>Chat</span>
        <span>{folded ? '▴' : '▾'}</span>
      </button>
      <div className={folded ? 'hidden' : 'h-56'}>
        <ChatPanel />
      </div>
    </div>
  );
};
