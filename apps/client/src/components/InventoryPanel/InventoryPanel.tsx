import type { PlayerInventory } from '@nvg/shared';
import { ItemListIcon } from '../ItemListIcon/ItemListIcon';
import './InventoryPanel.css';

interface Props {
  inventory: PlayerInventory | null;
}

// ---------------------------------------------------------------------------
// InventoryPanel
// ---------------------------------------------------------------------------
export const InventoryPanel = ({ inventory }: Props) => {
  if (!inventory) return null;

  const totalItems = inventory.items.reduce((sum, e) => sum + e.quantity, 0);

  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-black tracking-widest text-slate-300 uppercase">
          Backpack
        </h2>
        <span className="text-xs font-bold text-slate-500">
          {totalItems} / {inventory.slots}
        </span>
      </div>

      {/* Grid item list */}
      <div className="flex-1 overflow-y-auto p-4 content-start">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: inventory.slots }).map((_, idx) => {
            const entry = inventory.items[idx];

            if (entry) {
              return <ItemListIcon key={`${entry.item.id}-${idx}`} entry={entry} />;
            }

            // Empty slot
            return (
              <div
                key={`empty-${idx}`}
                className="w-full aspect-square bg-slate-900/50 border border-slate-700/50 rounded-lg shadow-inner"
              />
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700 shrink-0">
        <button className="w-full py-2.5 font-bold text-yellow-600 transition-all border border-yellow-600/30 rounded hover:bg-yellow-600/10 active:scale-95 text-sm uppercase tracking-widest cursor-pointer">
          Expand Slots
        </button>
      </div>
    </div>
  );
};
