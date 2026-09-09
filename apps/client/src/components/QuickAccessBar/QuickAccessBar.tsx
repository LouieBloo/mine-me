import React, { useState } from 'react';
import { useQuickAccess } from '../../contexts/QuickAccessContext';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { ItemTooltip } from '../ItemTooltip/ItemTooltip';
import './QuickAccessBar.css';

const NUM_SLOTS = 4;

export const QuickAccessBar: React.FC = () => {
  const {
    quickSlotItemIds,
    selectedSlotIndex,
    selectSlot,
    setSlotItem,
    swapSlots,
    getSlotEntry,
  } = useQuickAccess();

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, slotIndex: number) => {
    e.dataTransfer.setData('quick-slot-index', String(slotIndex));
    const itemDefId = quickSlotItemIds[slotIndex];
    if (itemDefId) {
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({ itemDefinitionId: itemDefId })
      );
    }
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverIndex !== slotIndex) {
      setDragOverIndex(slotIndex);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    // 1. Check if dragging from another quick slot (swap)
    const sourceSlotRaw = e.dataTransfer.getData('quick-slot-index');
    if (sourceSlotRaw !== '') {
      const sourceSlot = parseInt(sourceSlotRaw, 10);
      if (!isNaN(sourceSlot) && sourceSlot !== targetIndex) {
        swapSlots(sourceSlot, targetIndex);
        return;
      }
    }

    // 2. Check if dropped an item from the backpack
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const parsed = JSON.parse(jsonData);
        if (parsed.itemDefinitionId) {
          setSlotItem(targetIndex, parsed.itemDefinitionId);
          return;
        }
      } catch {
        // ignore JSON parse error
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, slotIndex: number) => {
    // Right click clears slot
    e.preventDefault();
    setSlotItem(slotIndex, null);
  };

  return (
    <div className="quick-access-bar flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-center px-0.5">
        <span className="text-[10px] font-black text-amber-500/90 uppercase tracking-widest flex items-center gap-1">
          ⚡ Quick Access
        </span>
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
          Keys 1-4
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 w-full">
        {Array.from({ length: NUM_SLOTS }).map((_, slotIndex) => {
          const { entry, totalQuantity } = getSlotEntry(slotIndex);
          const isSelected = selectedSlotIndex === slotIndex;
          const isDragOver = dragOverIndex === slotIndex;
          const item = entry?.item;
          const isDepleted = entry !== null && totalQuantity <= 0;

          const slotContent = (
            <div
              key={slotIndex}
              draggable={!!entry}
              onDragStart={(e) => handleDragStart(e, slotIndex)}
              onDragOver={(e) => handleDragOver(e, slotIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, slotIndex)}
              onClick={() => selectSlot(slotIndex)}
              onContextMenu={(e) => handleContextMenu(e, slotIndex)}
              title={
                entry
                  ? `${item?.name} (Slot ${slotIndex + 1}) - Right-click to clear`
                  : `Quick Slot ${slotIndex + 1} - Drag item from backpack`
              }
              className={`quick-access-slot group relative bg-slate-900/90 rounded-lg flex items-center justify-center overflow-hidden transition-all cursor-pointer ${
                isSelected
                  ? 'border-2 border-amber-400 ring-2 ring-amber-400/50 quick-access-slot-selected'
                  : isDragOver
                  ? 'border-2 border-amber-500/80 bg-slate-800/90 ring-2 ring-amber-500/30'
                  : 'border border-slate-700 hover:border-slate-500'
              }`}
            >
              {/* Slot Number on Top Right */}
              <span
                className={`absolute top-1 right-1 text-[9px] font-black px-1 rounded border z-20 pointer-events-none transition-colors ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-extrabold'
                    : 'bg-slate-950/80 text-amber-400/80 border-slate-800 group-hover:text-amber-300'
                }`}
              >
                {slotIndex + 1}
              </span>

              {/* Equipped Badge on Top Left */}
              {entry?.equipped && (
                <span className="absolute top-1 left-1 text-[8px] font-black text-white bg-emerald-600 border border-emerald-400 rounded px-1 shadow-sm z-20 pointer-events-none">
                  E
                </span>
              )}

              {/* Item Content */}
              {item ? (
                <div
                  className={`w-full h-full flex items-center justify-center relative p-1 ${
                    isDepleted ? 'opacity-40 grayscale' : ''
                  }`}
                >
                  {item.iconUrl ? (
                    <img
                      src={
                        item.iconUrl.startsWith('http')
                          ? item.iconUrl
                          : `${import.meta.env.VITE_API_URL || ''}${item.iconUrl}`
                      }
                      alt={item.name}
                      className="w-full h-full object-cover scale-90 group-hover:scale-100 transition-transform pointer-events-none"
                    />
                  ) : (
                    <span className="text-xs font-black text-amber-400 text-center uppercase truncate px-1">
                      {item.name.slice(0, 3)}
                    </span>
                  )}

                  {/* Quantity Badge on Bottom Right */}
                  <span
                    className={`absolute bottom-1 right-1 text-[10px] font-black px-1 min-w-[1.25rem] text-center rounded border shadow-sm z-20 pointer-events-none ${
                      isDepleted
                        ? 'bg-red-950/90 text-red-400 border-red-800'
                        : 'bg-slate-800/95 text-white border-slate-700'
                    }`}
                  >
                    {totalQuantity}
                  </span>
                </div>
              ) : (
                /* Empty Slot Indicator */
                <div className="w-full h-full flex items-center justify-center text-slate-700 group-hover:text-slate-500 transition-colors">
                  <span className="text-sm font-bold opacity-40">+</span>
                </div>
              )}
            </div>
          );

          return entry ? (
            <HoverTooltip
              key={slotIndex}
              content={<ItemTooltip entry={entry} />}
            >
              {slotContent}
            </HoverTooltip>
          ) : (
            slotContent
          );
        })}
      </div>
    </div>
  );
};
