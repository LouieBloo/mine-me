import React, { useEffect, useState } from 'react';
import type { MiningMouseController } from '../MiningGrid/input/MiningMouseController';
import './MiningModeIndicator.css';

export interface MiningModeIndicatorProps {
  controller: MiningMouseController;
}

/** Shows whether the pickaxe auto-targets or mines a single block, and switches it when clicked (Ctrl does the same). */
export const MiningModeIndicator: React.FC<MiningModeIndicatorProps> = ({ controller }) => {
  const [precise, setPrecise] = useState(controller.isPreciseMining());

  useEffect(() => {
    setPrecise(controller.isPreciseMining());
    return controller.onPreciseModeChange(setPrecise);
  }, [controller]);

  return (
    <button
      type="button"
      data-testid="mining-mode-indicator"
      data-mode={precise ? 'single' : 'auto'}
      onClick={() => controller.togglePreciseMode()}
      title="Switch between auto-target and single-block mining (Ctrl)"
      className={`mining-mode-indicator flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95 shadow-xl backdrop-blur-md border ${
        precise
          ? 'bg-amber-950/90 border-amber-500 text-amber-400 hover:bg-amber-900'
          : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800'
      }`}
    >
      <span>⛏</span>
      <span>{precise ? 'Single block' : 'Auto target'}</span>
      <kbd className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-600 text-[10px] font-mono text-slate-300">Ctrl</kbd>
    </button>
  );
};
