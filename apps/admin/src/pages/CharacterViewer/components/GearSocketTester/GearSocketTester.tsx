import React from 'react';
import type { GearSubType } from '@mine-me/shared';
import './GearSocketTester.css';

export interface GearSocketTesterProps {
  items: any[];
  selectedGear: Record<string, string>;
  setSelectedGear: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeGearCount: number;
  toolSocketOverride?: {
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
  };
  onChangeToolSocket?: (field: 'offsetX' | 'offsetY' | 'scale' | 'rotation', value: number) => void;
  onStepToolSocket?: (field: 'offsetX' | 'offsetY' | 'scale' | 'rotation', delta: number, isFloat?: boolean) => void;
  onResetToolSocket?: () => void;
}

const GEAR_SLOTS: GearSubType[] = [
  'HEAD',
  'SHOULDERS',
  'CHEST',
  'GAUNTLETS',
  'LEGGINGS',
  'BOOTS',
  'WEAPON',
];

export const GearSocketTester: React.FC<GearSocketTesterProps> = ({
  items,
  selectedGear,
  setSelectedGear,
  activeGearCount,
  toolSocketOverride,
  onChangeToolSocket,
  onStepToolSocket,
  onResetToolSocket,
}) => {
  const hasWeaponSelected = Boolean(selectedGear['WEAPON']);

  return (
    <div className="gear-socket-tester bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
      <div>
        <h3 className="font-black text-slate-800 text-base">
          Joint Socket Gear Attachments
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Select gear items from the database to attach directly to the animated joint nodes
          live in the viewer.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GEAR_SLOTS.map((slot) => {
          const availableItems = items.filter(
            (i) => i.type === 'GEAR' && i.subType === slot
          );

          return (
            <div key={slot} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2">
                {slot} Slot
              </label>
              <select
                value={selectedGear[slot] || ''}
                onChange={(e) =>
                  setSelectedGear((prev) => ({ ...prev, [slot]: e.target.value }))
                }
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- None Equipped --</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.rarity || 'Common'})
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Weapon Socket Tuning Controls */}
      {toolSocketOverride && (
        <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⛏️</span>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                Weapon Socket Tuning (Offset, Scale & Rotation)
              </h4>
              {hasWeaponSelected && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-200/60 text-amber-800 rounded-md">
                  Active
                </span>
              )}
            </div>
            {onResetToolSocket && (
              <button
                onClick={onResetToolSocket}
                className="px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200/80 rounded-lg transition cursor-pointer"
              >
                Reset Socket
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Offset X */}
            <div className="bg-white p-2.5 rounded-lg border border-amber-200/60">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Offset X</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={toolSocketOverride.offsetX}
                  onChange={(e) => onChangeToolSocket?.('offsetX', Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onStepToolSocket?.('offsetX', 5)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onStepToolSocket?.('offsetX', -5)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    -
                  </button>
                </div>
              </div>
            </div>

            {/* Offset Y */}
            <div className="bg-white p-2.5 rounded-lg border border-amber-200/60">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Offset Y</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={toolSocketOverride.offsetY}
                  onChange={(e) => onChangeToolSocket?.('offsetY', Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onStepToolSocket?.('offsetY', 5)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onStepToolSocket?.('offsetY', -5)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    -
                  </button>
                </div>
              </div>
            </div>

            {/* Scale */}
            <div className="bg-white p-2.5 rounded-lg border border-amber-200/60">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Scale</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.05"
                  value={toolSocketOverride.scale}
                  onChange={(e) => onChangeToolSocket?.('scale', Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onStepToolSocket?.('scale', 0.05, true)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onStepToolSocket?.('scale', -0.05, true)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    -
                  </button>
                </div>
              </div>
            </div>

            {/* Rotation */}
            <div className="bg-white p-2.5 rounded-lg border border-amber-200/60">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Rotation (rad)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={toolSocketOverride.rotation}
                  onChange={(e) => onChangeToolSocket?.('rotation', Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800"
                />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onStepToolSocket?.('rotation', 0.1, true)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onStepToolSocket?.('rotation', -0.1, true)}
                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold rounded cursor-pointer leading-none"
                  >
                    -
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeGearCount > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
          <span className="text-xs font-bold text-blue-800">
            Active Gear Overlays: {activeGearCount} piece(s)
          </span>
          <button
            onClick={() => setSelectedGear({})}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
          >
            Clear All Gear
          </button>
        </div>
      )}
    </div>
  );
};
