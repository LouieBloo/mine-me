import React from 'react';
import { getAssetUrl } from '@mine-me/shared';
import type { PartOverride } from '../../../hooks/useCharacterManifest';
import './PartCard.css';

export interface PartCardProps {
  partName: string;
  partDef: {
    file: string;
    slot: string;
    z_index: number;
    width: number;
    height: number;
    offset_from_pelvis: [number, number];
    pivot_anchor: [number, number];
  };
  currentValues: PartOverride;
  isHidden: boolean;
  isHighlighted: boolean;
  onReset: () => void;
  onToggleHighlight: () => void;
  onToggleVisibility: () => void;
  onChangeValue: (field: keyof PartOverride, value: number) => void;
  onStepValue: (field: keyof PartOverride, delta: number, isFloat?: boolean) => void;
}

export const PartCard: React.FC<PartCardProps> = ({
  partName,
  partDef,
  currentValues,
  isHidden,
  isHighlighted,
  onReset,
  onToggleHighlight,
  onToggleVisibility,
  onChangeValue,
  onStepValue,
}) => {
  const partImageUrl = getAssetUrl(`/assets/sprites/characters/miner/${partDef.file}`);

  return (
    <div
      className={`part-card bg-white p-5 rounded-2xl border shadow-sm transition ${
        isHighlighted
          ? 'border-yellow-400 ring-2 ring-yellow-300'
          : isHidden
          ? 'border-slate-200 opacity-60'
          : 'border-slate-200'
      }`}
    >
      {/* Card Top: Title & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-slate-800 text-base capitalize">
            {partName.replace('_', ' ')}
          </h3>
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 text-blue-700 rounded-md border border-blue-100 uppercase">
            Slot: {partDef.slot}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Z: {partDef.z_index}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onReset}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Reset
          </button>

          <button
            onClick={onToggleHighlight}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
              isHighlighted
                ? 'bg-yellow-400 text-slate-900 border-yellow-500 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {isHighlighted ? 'Highlighted' : 'Highlight'}
          </button>

          <button
            onClick={onToggleVisibility}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
              isHidden
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isHidden ? 'Hidden' : 'Visible'}
          </button>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Sprite Thumbnail */}
        <div className="checkerboard-bg w-28 h-28 rounded-2xl flex items-center justify-center p-2 border border-slate-700 shrink-0 shadow-inner">
          <img
            src={partImageUrl}
            alt={partName}
            className="max-w-full max-h-full object-contain filter drop-shadow-md"
          />
        </div>

        {/* Interactive Tuning Sliders / Steppers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow w-full">
          {/* Col 1: Position Offset (X & Y) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
              📍 Offset from Pelvis
            </span>

            {/* Offset X */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>X Offset:</span>
                <span className="font-bold text-blue-600">{currentValues.offsetX} px</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('offsetX', -5)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -5
                </button>
                <button
                  onClick={() => onStepValue('offsetX', -1)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -1
                </button>
                <input
                  type="number"
                  value={currentValues.offsetX}
                  onChange={(e) => onChangeValue('offsetX', parseInt(e.target.value) || 0)}
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('offsetX', 1)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +1
                </button>
                <button
                  onClick={() => onStepValue('offsetX', 5)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +5
                </button>
              </div>
            </div>

            {/* Offset Y */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>Y Offset:</span>
                <span className="font-bold text-blue-600">{currentValues.offsetY} px</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('offsetY', -5)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -5
                </button>
                <button
                  onClick={() => onStepValue('offsetY', -1)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -1
                </button>
                <input
                  type="number"
                  value={currentValues.offsetY}
                  onChange={(e) => onChangeValue('offsetY', parseInt(e.target.value) || 0)}
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('offsetY', 1)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +1
                </button>
                <button
                  onClick={() => onStepValue('offsetY', 5)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +5
                </button>
              </div>
            </div>
          </div>

          {/* Col 2: Dimensions (Width & Height) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
              📐 Size (Width × Height)
            </span>

            {/* Width */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>Width:</span>
                <span className="font-bold text-emerald-600">{currentValues.width} px</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('width', -10)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -10
                </button>
                <button
                  onClick={() => onStepValue('width', -2)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -2
                </button>
                <input
                  type="number"
                  value={currentValues.width}
                  onChange={(e) =>
                    onChangeValue('width', Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('width', 2)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +2
                </button>
                <button
                  onClick={() => onStepValue('width', 10)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* Height */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>Height:</span>
                <span className="font-bold text-emerald-600">{currentValues.height} px</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('height', -10)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -10
                </button>
                <button
                  onClick={() => onStepValue('height', -2)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -2
                </button>
                <input
                  type="number"
                  value={currentValues.height}
                  onChange={(e) =>
                    onChangeValue('height', Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('height', 2)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +2
                </button>
                <button
                  onClick={() => onStepValue('height', 10)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          {/* Col 3: Pivot Anchor (0.0 to 1.0) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
              🎯 Joint Pivot Anchor
            </span>

            {/* Pivot X */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>Anchor X:</span>
                <span className="font-bold text-purple-600">{currentValues.pivotX}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('pivotX', -0.05, true)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={currentValues.pivotX}
                  onChange={(e) => onChangeValue('pivotX', parseFloat(e.target.value) || 0)}
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('pivotX', 0.05, true)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Pivot Y */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mb-1">
                <span>Anchor Y:</span>
                <span className="font-bold text-purple-600">{currentValues.pivotY}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onStepValue('pivotY', -0.05, true)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={currentValues.pivotY}
                  onChange={(e) => onChangeValue('pivotY', parseFloat(e.target.value) || 0)}
                  className="w-full text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded py-1 px-1"
                />
                <button
                  onClick={() => onStepValue('pivotY', 0.05, true)}
                  className="w-7 h-7 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold text-xs cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
