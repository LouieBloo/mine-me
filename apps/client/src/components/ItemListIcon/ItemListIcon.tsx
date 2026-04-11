import type { InventoryEntry } from '@nvg/shared';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { ItemTooltip } from '../ItemTooltip/ItemTooltip';


import './ItemListIcon.css';

interface ItemListIconProps {
  entry: InventoryEntry;
}

export const ItemListIcon = ({ entry }: ItemListIconProps) => {
  const { item, quantity } = entry;

  return (
    <HoverTooltip content={<ItemTooltip entry={entry} />}>
      <div className="relative w-full aspect-square bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center overflow-hidden hover:border-slate-500 hover:ring-2 hover:ring-slate-700 transition-all cursor-pointer group">
        {item.iconUrl ? (
          <img
            src={
              item.iconUrl.startsWith('http')
                ? item.iconUrl
                : `${import.meta.env.VITE_API_URL}${item.iconUrl}`
            }
            alt={item.name}
            className="w-full h-full object-cover scale-90 group-hover:scale-100 transition-transform"
          />
        ) : (
          <span className="text-xl font-black text-slate-600">
            {item.name.charAt(0)}
          </span>
        )}

        {/* Quantity badge - absolute positioned in bottom right */}
        {quantity > 1 && (
          <span className="absolute bottom-1 right-1 text-[10px] font-black text-white bg-slate-800/90 border border-slate-700 rounded px-1 min-w-[1.25rem] text-center shadow-black shadow-sm">
            {quantity}
          </span>
        )}
      </div>
    </HoverTooltip>
  );
};
