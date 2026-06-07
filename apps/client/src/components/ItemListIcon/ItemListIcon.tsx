import { useState } from 'react';
import type { InventoryEntry } from '@nvg/shared';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { ItemTooltip } from '../ItemTooltip/ItemTooltip';
import { useSocket } from '../../contexts/SocketContext';
import { notificationService } from '../../services/notificationService';

import './ItemListIcon.css';

interface ItemListIconProps {
  entry: InventoryEntry;
}

export const ItemListIcon = ({ entry }: ItemListIconProps) => {
  const { item, quantity } = entry;
  const { sendGameEvent } = useSocket();
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleDoubleClick = async () => {
    if (item.type !== 'GEAR' || loading) return;
    setLoading(true);
    try {
      const result = await sendGameEvent({
        type: entry.equipped ? 'unequip_item' : 'equip_item',
        inventoryItemId: entry.id,
      });
      if (!result.success) {
        notificationService.error(
          entry.equipped ? 'Failed to unequip' : 'Failed to equip',
          result.error || 'Unknown error occurred.'
        );
      }
    } catch (err: any) {
      notificationService.error('Error', err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (item.type === 'CONSUMABLE') {
      setShowMenu(!showMenu);
    }
  };

  const handleConsume = async () => {
    setShowMenu(false);
    if (loading) return;
    setLoading(true);
    try {
      const result = await sendGameEvent({
        type: 'consume_item',
        inventoryItemId: entry.id,
      });
      if (result.success) {
        notificationService.success(
          'Consumed Potion',
          `You consumed ${item.name} and recovered ${result.data?.healthRecovered || 0} HP and ${result.data?.staminaRecovered || 0} Stamina.`
        );
      } else {
        notificationService.error(
          'Failed to consume',
          result.error || 'Unknown error occurred.'
        );
      }
    } catch (err: any) {
      notificationService.error('Error', err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <HoverTooltip content={<ItemTooltip entry={entry} />}>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => setShowMenu(false)}
        className={`relative w-full aspect-square bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden transition-all cursor-pointer group ${
          entry.equipped
            ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/20'
            : 'border border-slate-700 hover:border-slate-500 hover:ring-2 hover:ring-slate-700'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-10">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {showMenu && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center z-20 p-2 gap-1 animate-fade-in">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConsume();
              }}
              className="cursor-pointer w-full py-1.5 text-[10px] font-black text-center text-white bg-amber-600 hover:bg-amber-500 rounded uppercase tracking-wider transition-all duration-150 active:scale-95 shadow-sm"
            >
              Consume
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
              className="cursor-pointer w-full py-1 text-[9px] font-black text-center text-slate-400 bg-slate-800 hover:bg-slate-700 rounded uppercase tracking-wider transition-all duration-150 active:scale-95"
            >
              Cancel
            </button>
          </div>
        )}

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
          <div className="item-name-placeholder">
            <span className="item-name-text">
              {item.name}
            </span>
          </div>
        )}

        {/* Quantity badge - absolute positioned in bottom right */}
        {quantity > 1 && (
          <span className="absolute bottom-1 right-1 text-[10px] font-black text-white bg-slate-800/90 border border-slate-700 rounded px-1 min-w-[1.25rem] text-center shadow-black shadow-sm">
            {quantity}
          </span>
        )}

        {/* Equipped badge - absolute positioned in top right */}
        {entry.equipped && (
          <span className="absolute top-1 right-1 text-[8px] font-black text-white bg-emerald-600 border border-emerald-400 rounded px-1 shadow-sm">
            E
          </span>
        )}
      </div>
    </HoverTooltip>
  );
};
