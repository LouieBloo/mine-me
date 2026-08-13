import React from 'react';
import { getAssetUrl } from '@mine-me/shared';
import { Modal } from '../Modal/Modal';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { ItemTooltip } from '../ItemTooltip/ItemTooltip';
import './LootSpoilsModal.css';

export interface LootItemDescriptor {
  itemId: string;
  quantity: number;
  itemDetails?: {
    id: string;
    name: string;
    description?: string;
    iconUrl?: string | null;
    type?: string;
    rarity?: string;
    [key: string]: any;
  } | null;
}

interface LootSpoilsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description: string;
  sol: number;
  experience: number;
  items: LootItemDescriptor[];
  acceptButtonText?: string;
}

const getRarityColorClass = (rarity?: string) => {
  switch (rarity) {
    case 'VERY_RARE':
      return {
        text: 'text-purple-400',
        bg: 'bg-purple-950/30',
        border: 'border-purple-800/50 hover:border-purple-600',
        shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
      };
    case 'RARE':
      return {
        text: 'text-blue-400',
        bg: 'bg-blue-950/30',
        border: 'border-blue-800/50 hover:border-blue-600',
        shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.15)]',
      };
    case 'MEDIUM':
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-950/30',
        border: 'border-emerald-800/50 hover:border-emerald-600',
        shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      };
    case 'LOW':
    default:
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-900/50',
        border: 'border-slate-800 hover:border-slate-700',
        shadow: '',
      };
  }
};

export const LootSpoilsModal: React.FC<LootSpoilsModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  sol,
  experience,
  items,
  acceptButtonText = 'Accept Loot',
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidthClass="max-w-lg">
      <div className="flex flex-col gap-6">
        <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
          {description}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Sol Gained */}
          {sol > 0 && (
            <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-900/50 rounded-lg p-3 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <span className="text-xl">🪙</span>
              <div>
                <div className="text-[10px] font-black text-amber-500/70 uppercase tracking-wider leading-none">Sol Gained</div>
                <div className="text-sm font-black text-amber-400 mt-1">+{sol}</div>
              </div>
            </div>
          )}

          {/* XP Gained */}
          {experience > 0 && (
            <div className="flex items-center gap-3 bg-purple-950/20 border border-purple-900/50 rounded-lg p-3 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
              <span className="text-xl">⚡</span>
              <div>
                <div className="text-[10px] font-black text-purple-500/70 uppercase tracking-wider leading-none">XP Gained</div>
                <div className="text-sm font-black text-purple-400 mt-1">+{experience} XP</div>
              </div>
            </div>
          )}
        </div>

        {/* Items List */}
        {items && items.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Items Obtained</h3>
            <div className="grid grid-cols-6 gap-2 bg-slate-950/50 border border-slate-800 rounded-lg p-3">
              {items.map((item, idx) => {
                const rarityColors = getRarityColorClass(item.itemDetails?.rarity);
                const mockEntry = {
                  id: item.itemId,
                  item: item.itemDetails,
                  quantity: item.quantity,
                  equipped: false,
                } as any;

                return (
                  <HoverTooltip key={idx} content={<ItemTooltip entry={mockEntry} />}>
                    <div
                      className={`relative aspect-square ${rarityColors.bg} border-2 ${rarityColors.border} rounded-lg flex items-center justify-center overflow-hidden transition-all duration-300 ${rarityColors.shadow} hover:scale-105 cursor-pointer`}
                    >
                      {item.itemDetails?.iconUrl ? (
                        <img
                          src={getAssetUrl(item.itemDetails.iconUrl)}
                          alt={item.itemDetails.name}
                          className="w-full h-full object-cover scale-90"
                        />
                      ) : (
                        <div className="flex items-center justify-center p-2 text-center">
                          <span className="text-[10px] font-black text-slate-500 uppercase leading-tight truncate">
                            {item.itemDetails?.name || 'Item'}
                          </span>
                        </div>
                      )}
                      {item.quantity > 1 && (
                        <span className="absolute bottom-1 right-1 text-[9px] font-black text-white bg-slate-900/90 border border-slate-700/50 rounded px-1.5 py-0.5 leading-none shadow-sm">
                          {item.quantity}
                        </span>
                      )}
                    </div>
                  </HoverTooltip>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-slate-950/30 border border-slate-800 rounded-lg">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              No items obtained
            </p>
          </div>
        )}

        <div className="flex justify-end mt-2">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-lg border border-amber-400 cursor-pointer transition-all active:scale-95 shadow-lg shadow-amber-950/20"
          >
            {acceptButtonText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
