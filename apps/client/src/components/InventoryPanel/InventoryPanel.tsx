import type { PlayerInventory } from '@nvg/shared';
import './InventoryPanel.css';

interface Props {
  inventory: PlayerInventory | null;
}

export const InventoryPanel = ({ inventory }: Props) => {
  if (!inventory) return null;

  // Fill empty slots up to the player's max slots definition
  const slots = Array.from({ length: inventory.slots }, (_, i) => inventory.items[i] || null);

  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 shadow-2xl">
       <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <h2 className="text-lg font-black tracking-widest text-slate-300 uppercase">Backpack</h2>
        <span className="text-xs font-bold text-slate-500">{inventory.items.length} / {inventory.slots}</span>
      </div>

      <div className="p-4 overflow-y-auto">
        <div className="grid grid-cols-4 gap-2">
          {slots.map((item, idx) => (
            <div 
              key={idx} 
              className={`
                aspect-square rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer shadow-inner
                ${item 
                  ? 'bg-slate-700 border-slate-600 hover:border-yellow-500 hover:bg-slate-600 hover:-translate-y-1 hover:shadow-lg' 
                  : 'bg-slate-900/50 border-slate-800 border-dashed'}
              `}
              title={item?.name}
            >
              {item && (
                <div className="text-xs font-bold text-slate-300 truncate w-full text-center px-1">
                  {item.name.substring(0, 3)}
                </div>
              )}
            </div>
          ))}
        </div>
        
        <button className="w-full mt-6 py-3 font-bold text-yellow-600 transition-all border border-yellow-600/30 rounded hover:bg-yellow-600/10 active:scale-95 text-sm uppercase tracking-widest">
          Expand Slots
        </button>
      </div>
    </div>
  );
};
