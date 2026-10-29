import React from 'react';
import './ExitPrompt.css';

/** The key that opens the leave confirmation while standing at the extraction point. */
export const EXIT_KEY = 'e';

export interface ExitPromptProps {
  /** Whether the player stands at the extraction point (the prompt is only shown then). */
  visible: boolean;
  onLeave: () => void;
}

/**
 * "Press E to leave the mine": shown only while the player stands at the extraction point, as text and as a button
 * (the key and a click do the same: ask to leave).
 */
export const ExitPrompt: React.FC<ExitPromptProps> = ({ visible, onLeave }) => {
  if (!visible) return null;
  return (
    <div className="exit-prompt absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center">
      <button
        type="button"
        onClick={onLeave}
        className="pointer-events-auto cursor-pointer flex items-center gap-3 px-5 py-3 rounded-xl bg-emerald-950/85 hover:bg-emerald-900/95 text-emerald-300 border border-emerald-500/60 shadow-[0_0_18px_rgba(16,185,129,0.3)] font-black text-xs uppercase tracking-widest transition-all active:scale-95 animate-pulse hover:animate-none"
      >
        <kbd className="px-2 py-1 bg-slate-900 border border-emerald-500/50 rounded text-emerald-200">{EXIT_KEY.toUpperCase()}</kbd>
        <span>Leave the mine</span>
      </button>
    </div>
  );
};
