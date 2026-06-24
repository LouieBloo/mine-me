import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { PlayerInventory, InventoryEntry } from '@nvg/shared';
import { ItemListIcon } from '../ItemListIcon/ItemListIcon';
import './InventoryPanel.css';

interface Props {
  inventory: PlayerInventory | null;
}

type SortOption = 'default' | 'name' | 'rarity';
type SortOrder = 'asc' | 'desc';

const RARITY_VALUE: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  RARE: 3,
  VERY_RARE: 4,
};

export const InventoryPanel = ({ inventory }: Props) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  if (!inventory) return null;

  const totalItems = inventory.items.reduce((sum, e) => sum + e.quantity, 0);

  // Group items by category: Consumables first, Materials second, Gear last
  const sortedAndGroupedItems = useMemo(() => {
    // 1. First sort the items according to user preference
    const itemsCopy = [...inventory.items];

    if (sortBy === 'name') {
      itemsCopy.sort((a, b) => {
        const nameA = a.item.name.toLowerCase();
        const nameB = b.item.name.toLowerCase();
        if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
        if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else if (sortBy === 'rarity') {
      itemsCopy.sort((a, b) => {
        const valA = a.item.rarity ? (RARITY_VALUE[a.item.rarity] || 0) : 0;
        const valB = b.item.rarity ? (RARITY_VALUE[b.item.rarity] || 0) : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    }

    // 2. Separate them into groups
    const consumables: InventoryEntry[] = [];
    const materials: InventoryEntry[] = [];
    const gear: InventoryEntry[] = [];

    itemsCopy.forEach((entry) => {
      if (entry.item.type === 'CONSUMABLE') {
        consumables.push(entry);
      } else if (entry.item.type === 'MATERIAL') {
        materials.push(entry);
      } else {
        gear.push(entry);
      }
    });

    return { consumables, materials, gear };
  }, [inventory.items, sortBy, sortOrder]);

  const handleSortToggle = (option: SortOption) => {
    if (sortBy === option) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(option);
      setSortOrder('asc');
    }
  };

  const emptySlotsCount = Math.max(0, inventory.slots - inventory.items.length);

  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 shadow-2xl">
      {/* User / Profile Header Bar */}
      <div className="p-3 border-b border-slate-700 bg-slate-900/40 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all text-left group cursor-pointer"
        >
          <div className="w-5 h-5 rounded-full bg-slate-950 border border-slate-600 group-hover:border-yellow-500/80 flex items-center justify-center text-xs transition-colors">
            👤
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 group-hover:text-yellow-500/80 transition-colors">
            {user?.familyName || 'Profile'}
          </span>
        </button>

        <button
          onClick={logout}
          className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-red-500/15"
        >
          Logout
        </button>
      </div>

      {/* Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="text-md font-black tracking-widest text-slate-300 uppercase">
            Backpack
          </h2>
          <span className="text-xs font-bold text-slate-500">
            {totalItems} / {inventory.slots}
          </span>
        </div>

        {/* Sort Controls */}
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Sort:</span>

          <button
            onClick={() => handleSortToggle('default')}
            className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded transition-all cursor-pointer ${sortBy === 'default'
              ? 'bg-slate-700 text-slate-200 shadow'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
          >
            Type
          </button>

          <button
            onClick={() => handleSortToggle('name')}
            className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded transition-all flex items-center gap-0.5 cursor-pointer ${sortBy === 'name'
              ? 'bg-slate-700 text-slate-200 shadow'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
          >
            Name {sortBy === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSortToggle('rarity')}
            className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded transition-all flex items-center gap-0.5 cursor-pointer ${sortBy === 'rarity'
              ? 'bg-slate-700 text-slate-200 shadow'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
              }`}
          >
            Rarity {sortBy === 'rarity' && (sortOrder === 'asc' ? '▲' : '▼')}
          </button>
        </div>
      </div>

      {/* Grid item list grouped by type */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Consumables (Potions) */}
        {sortedAndGroupedItems.consumables.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/40 pb-1">
              Consumables
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {sortedAndGroupedItems.consumables.map((entry, idx) => (
                <ItemListIcon key={`pot-${entry.item.id}-${idx}`} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {sortedAndGroupedItems.materials.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/40 pb-1">
              Materials
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {sortedAndGroupedItems.materials.map((entry, idx) => (
                <ItemListIcon key={`mat-${entry.item.id}-${idx}`} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Gear */}
        {sortedAndGroupedItems.gear.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/40 pb-1">
              Gear (Equipment)
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {sortedAndGroupedItems.gear.map((entry, idx) => (
                <ItemListIcon key={`gear-${entry.item.id}-${idx}`} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* Empty slots section if any exist */}
        {emptySlotsCount > 0 && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-700/20 pb-1">
              Empty Slots ({emptySlotsCount})
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="w-full aspect-square bg-slate-900/30 border border-slate-700/30 rounded-lg shadow-inner"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700 shrink-0">
        <button className="w-full py-2 font-bold text-yellow-600 transition-all border border-yellow-600/30 rounded hover:bg-yellow-600/10 active:scale-95 text-xs uppercase tracking-widest cursor-pointer">
          Expand Slots
        </button>
      </div>
    </div>
  );
};
