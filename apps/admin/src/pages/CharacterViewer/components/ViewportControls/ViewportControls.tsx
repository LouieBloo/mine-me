import React from 'react';
import type { CharacterAnimationState } from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import './ViewportControls.css';

export interface ViewportControlsProps {
  animState: CharacterAnimationState;
  setAnimState: (state: CharacterAnimationState) => void;
  speedMultiplier: number;
  setSpeedMultiplier: (speed: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isFlipped: boolean;
  setIsFlipped: (flipped: boolean) => void;
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  rootOffsetY: number;
  setRootOffsetY: (offsetY: number) => void;
  showJoints: boolean;
  setShowJoints: (show: boolean) => void;
  showBones: boolean;
  setShowBones: (show: boolean) => void;
  showBbox: boolean;
  setShowBbox: (show: boolean) => void;
}

export const ViewportControls: React.FC<ViewportControlsProps> = ({
  animState,
  setAnimState,
  speedMultiplier,
  setSpeedMultiplier,
  isPlaying,
  setIsPlaying,
  isFlipped,
  setIsFlipped,
  scale,
  setScale,
  rootOffsetY,
  setRootOffsetY,
  showJoints,
  setShowJoints,
  showBones,
  setShowBones,
  showBbox,
  setShowBbox,
}) => {
  return (
    <div className="viewport-controls-container w-full space-y-3">
      {/* Animation State Switcher */}
      <div className="w-full pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Animation:
        </span>
        <div className="flex items-center gap-1.5">
          {(['idle', 'walk', 'mine'] as CharacterAnimationState[]).map((state) => (
            <button
              key={state}
              onClick={() => setAnimState(state)}
              className={`px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer ${
                animState === state
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {state}
            </button>
          ))}
        </div>
      </div>

      {/* Playback Controls & Speed Multiplier */}
      <div className="w-full pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                isPlaying
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
              }`}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>

            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer ${
                isFlipped
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Flip: {isFlipped ? 'Left ◀' : 'Right ▶'}
            </button>
          </div>

          {/* Scale Controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded cursor-pointer"
            >
              -
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-700 px-1">
              {scale.toFixed(2)}x
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}
              className="w-6 h-6 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-white rounded cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Speed Slider */}
        <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Speed: {speedMultiplier.toFixed(2)}x
          </span>
          <div className="flex items-center gap-2 flex-grow max-w-xs">
            <input
              type="range"
              min="0.25"
              max="2.5"
              step="0.05"
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-blue-600"
            />
            <button
              onClick={() => setSpeedMultiplier(1.0)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 bg-slate-200 rounded cursor-pointer"
            >
              1x
            </button>
          </div>
        </div>

        {/* Viewport Origin / Root Y Offset Slider */}
        <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Root Y: {rootOffsetY}px
          </span>
          <div className="flex items-center gap-2 flex-grow max-w-xs">
            <input
              type="range"
              min="-200"
              max="200"
              step="5"
              value={rootOffsetY}
              onChange={(e) => setRootOffsetY(parseInt(e.target.value) || 0)}
              className="w-full cursor-pointer accent-emerald-600"
            />
            <button
              onClick={() => setRootOffsetY(0)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 bg-slate-200 rounded cursor-pointer"
            >
              0
            </button>
          </div>
        </div>

        {/* Debug Layer Toggles */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Debug Overlays:
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={showJoints}
                onChange={(e) => setShowJoints(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0 cursor-pointer"
              />
              Joints
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={showBones}
                onChange={(e) => setShowBones(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0 cursor-pointer"
              />
              Bones
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={showBbox}
                onChange={(e) => setShowBbox(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0 cursor-pointer"
              />
              Boxes
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
