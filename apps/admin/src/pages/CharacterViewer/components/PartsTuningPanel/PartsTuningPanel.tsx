import React from 'react';
import type { SkeletonManifest } from '../../../../components/ModularCharacterCanvas/ModularCharacterCanvas';
import type {
  PartOverride,
  PartOverridesMap,
  HandJointOverride,
  ToolSocketOverride,
} from '../../hooks/useCharacterManifest';
import { PartCard } from './PartCard/PartCard';
import './PartsTuningPanel.css';

export interface PartsTuningPanelProps {
  manifest: SkeletonManifest | null;
  partOverrides: PartOverridesMap;
  hiddenParts: string[];
  highlightedPart: string | null;
  setHiddenParts: React.Dispatch<React.SetStateAction<string[]>>;
  setHighlightedPart: (part: string | null) => void;
  onResetPart: (partName: string) => void;
  onChangePartValue: (partName: string, field: keyof PartOverride, value: number) => void;
  onStepPartValue: (partName: string, field: keyof PartOverride, delta: number, isFloat?: boolean) => void;
  handJointOverride?: HandJointOverride;
  onChangeHandJoint?: (field: keyof HandJointOverride, value: number) => void;
  onStepHandJoint?: (field: keyof HandJointOverride, delta: number) => void;
  onResetHandJoint?: () => void;
  toolSocketOverride?: ToolSocketOverride;
  onChangeToolSocket?: (field: keyof ToolSocketOverride, value: number) => void;
  onStepToolSocket?: (field: keyof ToolSocketOverride, delta: number, isFloat?: boolean) => void;
  onResetToolSocket?: () => void;
}

export const PartsTuningPanel: React.FC<PartsTuningPanelProps> = ({
  manifest,
  partOverrides,
  hiddenParts,
  highlightedPart,
  setHiddenParts,
  setHighlightedPart,
  onResetPart,
  onChangePartValue,
  onStepPartValue,
  handJointOverride,
  onChangeHandJoint,
  onStepHandJoint,
  onResetHandJoint,
  toolSocketOverride,
  onChangeToolSocket,
  onStepToolSocket,
  onResetToolSocket,
}) => {
  const partsList = manifest ? Object.entries(manifest.parts) : [];

  const togglePartVisibility = (partName: string) => {
    setHiddenParts((prev) =>
      prev.includes(partName) ? prev.filter((p) => p !== partName) : [...prev, partName]
    );
  };

  return (
    <div className="parts-tuning-panel space-y-4 animate-in fade-in">
      <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center justify-between text-xs text-blue-900">
        <span>
          💡 <strong>Tip:</strong> Use the <strong>+ / - buttons</strong> or type values to adjust dimensions, pelvis offsets (X/Y), pivot anchors, and weapon sockets live. Click <strong>💾 Save Rig Coordinates</strong> above when satisfied.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Hand / Wrist Joint Card */}
        {handJointOverride && (
          <div className="hand-joint-card bg-cyan-50/70 p-5 rounded-2xl border border-cyan-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">✋</span>
                <h3 className="font-black text-cyan-950 text-base">
                  Hand / Wrist Joint
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-cyan-200/80 text-cyan-900 rounded-md border border-cyan-300/80 uppercase">
                  Joint: handFront (Cyan)
                </span>
                <span className="text-[10px] text-cyan-700 font-mono">
                  Parent: arm_front
                </span>
              </div>

              {onResetHandJoint && (
                <button
                  onClick={onResetHandJoint}
                  className="px-2.5 py-1 text-[11px] font-bold text-cyan-800 hover:text-cyan-950 bg-cyan-200/80 hover:bg-cyan-300 rounded-lg transition cursor-pointer"
                >
                  Reset Hand Joint
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Hand Offset X */}
              <div className="bg-white p-3 rounded-xl border border-cyan-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Hand Offset X</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={handJointOverride.offsetX}
                    onChange={(e) => onChangeHandJoint?.('offsetX', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepHandJoint?.('offsetX', 5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepHandJoint?.('offsetX', -5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              {/* Hand Offset Y */}
              <div className="bg-white p-3 rounded-xl border border-cyan-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Hand Offset Y</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={handJointOverride.offsetY}
                    onChange={(e) => onChangeHandJoint?.('offsetY', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepHandJoint?.('offsetY', 5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepHandJoint?.('offsetY', -5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tool Socket Card for Weapon */}
        {toolSocketOverride && (
          <div className="tool-socket-card bg-amber-50/70 p-5 rounded-2xl border border-amber-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">⛏️</span>
                <h3 className="font-black text-amber-950 text-base">
                  Weapon / Tool Socket
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-200/80 text-amber-900 rounded-md border border-amber-300/80 uppercase">
                  Slot: WEAPON (toolSocket)
                </span>
                <span className="text-[10px] text-amber-700 font-mono">
                  Parent: arm_front
                </span>
              </div>

              {onResetToolSocket && (
                <button
                  onClick={onResetToolSocket}
                  className="px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-amber-200/80 hover:bg-amber-300 rounded-lg transition cursor-pointer"
                >
                  Reset Socket
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Offset X */}
              <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Offset X</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={toolSocketOverride.offsetX}
                    onChange={(e) => onChangeToolSocket?.('offsetX', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepToolSocket?.('offsetX', 5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepToolSocket?.('offsetX', -5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              {/* Offset Y */}
              <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Offset Y</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={toolSocketOverride.offsetY}
                    onChange={(e) => onChangeToolSocket?.('offsetY', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepToolSocket?.('offsetY', 5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepToolSocket?.('offsetY', -5)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              {/* Scale */}
              <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Scale</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.05"
                    value={toolSocketOverride.scale}
                    onChange={(e) => onChangeToolSocket?.('scale', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepToolSocket?.('scale', 0.05, true)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepToolSocket?.('scale', -0.05, true)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              {/* Rotation */}
              <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Rotation (rad)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={toolSocketOverride.rotation}
                    onChange={(e) => onChangeToolSocket?.('rotation', Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-mono text-slate-800"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onStepToolSocket?.('rotation', 0.1, true)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onStepToolSocket?.('rotation', -0.1, true)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {partsList.map(([partName, partDef]) => {
          const isHidden = hiddenParts.includes(partName);
          const isHighlighted = highlightedPart === partName;
          const currentValues = partOverrides[partName] || {
            width: partDef.width,
            height: partDef.height,
            offsetX: partDef.offset_from_pelvis[0],
            offsetY: partDef.offset_from_pelvis[1],
            pivotX: partDef.pivot_anchor[0],
            pivotY: partDef.pivot_anchor[1],
          };

          return (
            <PartCard
              key={partName}
              partName={partName}
              partDef={partDef}
              currentValues={currentValues}
              isHidden={isHidden}
              isHighlighted={isHighlighted}
              onReset={() => onResetPart(partName)}
              onToggleHighlight={() => setHighlightedPart(isHighlighted ? null : partName)}
              onToggleVisibility={() => togglePartVisibility(partName)}
              onChangeValue={(field, value) => onChangePartValue(partName, field, value)}
              onStepValue={(field, delta, isFloat) => onStepPartValue(partName, field, delta, isFloat)}
            />
          );
        })}
      </div>
    </div>
  );
};
