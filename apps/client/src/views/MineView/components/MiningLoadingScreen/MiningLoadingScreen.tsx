import React, { useEffect, useState } from 'react';
import './MiningLoadingScreen.css';

export interface MiningLoadingScreenProps {
  isLoading: boolean;
  message?: string;
  subMessage?: string;
  /** How far along loading is, 0 to 1. The bar is hidden when omitted. */
  progress?: number;
}

export const MiningLoadingScreen: React.FC<MiningLoadingScreenProps> = ({
  isLoading,
  message = 'Entering Dungeon Mine...',
  subMessage = 'Rigging equipment and illuminating cavern depths...',
  progress,
}) => {
  const [shouldRender, setShouldRender] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  const percent = progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div
      data-testid="mining-loading-screen"
      className={`mining-loading-screen absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md ${
        !isLoading ? 'fade-out' : ''
      }`}
    >
      <div className="flex flex-col items-center max-w-sm px-6 text-center">
        {/* Animated Amber Spinner */}
        <div className="relative mb-6">
          <div className="w-14 h-14 border-4 border-amber-500/20 rounded-full" />
          <div className="absolute inset-0 w-14 h-14 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(245,158,11,0.3)]" />
          <div className="absolute inset-0 flex items-center justify-center text-lg">
            ⛏️
          </div>
        </div>

        {/* Primary Message */}
        <h2 className="text-white text-base font-black tracking-widest uppercase mb-2 drop-shadow-md">
          {message}
        </h2>

        {/* Secondary Subtitle */}
        <p className="text-slate-400 text-xs font-semibold tracking-wider animate-pulse">
          {subMessage}
        </p>

        {/* Progress bar */}
        {percent !== null && (
          <div className="mt-6 w-64">
            <div
              role="progressbar"
              aria-label="Loading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700"
            >
              <div
                data-testid="mining-loading-bar"
                className="mining-loading-bar h-full rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-bold tracking-wider text-slate-400">{percent}%</p>
          </div>
        )}

        {/* Tip Badge */}
        <div className="mt-8 px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 font-medium">
          <span className="text-amber-400 font-bold uppercase tracking-wider mr-1.5">Tip:</span>
          Use <span className="text-slate-200 font-semibold">WASD</span> or <span className="text-slate-200 font-semibold">Arrow Keys</span> to navigate and mine!
        </div>
      </div>
    </div>
  );
};
