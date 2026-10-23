import React from 'react';
import type { BeltBlockedReason } from '@mine-me/shared';
import './BeltStatus.css';

interface BeltStatusProps {
  rows: number;
  blockedBy: BeltBlockedReason | null;
}

/** What the belt is waiting for, in words the player can act on. */
export const BELT_WAIT_TEXT: Record<BeltBlockedReason, string> = {
  fluid: 'Fluid is in the way: clear it to let the belt dig on',
  gas: 'Gas is in the way: clear it to let the belt dig on',
  fire: 'Fire is in the way: put it out to let the belt dig on',
  rock: 'A rock is falling in the shaft',
  solid: 'The belt hit something it cannot dig through',
  bottom: 'The belt reached the bottom of the mine',
};

/** One line in the HUD about the conveyor belt: how far it has dug, and what it is waiting for (if anything). */
export const BeltStatus: React.FC<BeltStatusProps> = ({ rows, blockedBy }) => {
  const stopped = blockedBy === 'bottom' || blockedBy === 'solid';
  return (
    <div
      className="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 w-72 text-[11px] font-bold shadow-2xl backdrop-blur-md"
      data-testid="belt-status"
    >
      <div className="flex justify-between items-center">
        <span className="text-amber-500 uppercase tracking-wider text-xs font-black">Conveyor Belt</span>
        <span className="text-slate-400">{rows} {rows === 1 ? 'segment' : 'segments'} deep</span>
      </div>
      {blockedBy && (
        <p className={`mt-1 font-medium ${stopped ? 'text-slate-400' : 'text-orange-300'}`} data-testid="belt-wait">
          {BELT_WAIT_TEXT[blockedBy]}
        </p>
      )}
    </div>
  );
};
