import React from 'react';
import { type MiningBackpackItem } from '@mine-me/shared';
import { GameImage } from '../../../../components/GameImage/GameImage';
import './TemporaryBackpack.css';

interface TemporaryBackpackProps {
  items: MiningBackpackItem[];
  /** Current weight and the most the backpack can hold; no bar when the capacity is unknown. */
  weight?: number;
  capacity?: number;
}

/** How full the backpack is, 0 to 1 (a full or over-full pack is 1). */
export function backpackFillRatio(weight: number | undefined, capacity: number | undefined): number {
  if (!capacity || capacity <= 0) return 1;
  return Math.min(1, Math.max(0, (weight ?? 0) / capacity));
}

const formatWeight = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const TemporaryBackpack: React.FC<TemporaryBackpackProps> = ({ items, weight, capacity }) => {
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="temporary-backpack-container bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md w-72 pointer-events-auto">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🎒</span>
          <span className="text-xs font-black text-amber-500 uppercase tracking-wider">
            Temporary Backpack
          </span>
        </div>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {capacity !== undefined && capacity > 0 && (
        <div className="mb-2" data-testid="backpack-weight">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-0.5">
            <span>Weight</span>
            <span className={backpackFillRatio(weight, capacity) >= 1 ? 'text-red-400' : ''}>
              {formatWeight(weight ?? 0)} / {formatWeight(capacity)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              data-testid="backpack-weight-fill"
              className={`h-full rounded-full transition-all ${backpackFillRatio(weight, capacity) >= 1 ? 'bg-red-500' : backpackFillRatio(weight, capacity) >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${backpackFillRatio(weight, capacity) * 100}%` }}
            />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-[11px] text-slate-500 font-medium italic text-center py-2 bg-slate-950/40 rounded-lg border border-slate-800/60">
          Backpack empty. Mine blocks to collect drops!
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
          {items.map((item, idx) => {
            return (
              <div
                key={`${item.itemId}_${idx}`}
                className="relative bg-slate-950/80 border border-slate-800 rounded-lg p-1.5 flex flex-col items-center justify-center w-full aspect-square group hover:border-amber-500/50 transition-colors"
                title={`${item.itemName} (x${item.quantity})`}
              >
                <GameImage
                  src={item.iconUrl}
                  alt={item.itemName}
                  className="w-8 h-8 object-contain pixelated"
                  style={{ imageRendering: 'pixelated' }}
                  fallback={<span className="text-lg">📦</span>}
                />
                <span className="absolute bottom-0.5 right-1 text-[10px] font-black text-amber-400 font-mono drop-shadow">
                  {item.quantity}
                </span>

                {/* Hover Tooltip */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-950 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                  {item.itemName}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
