import type { InventoryEntry, ItemType } from '@nvg/shared';
import {
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_BG,
  SUBTYPE_LABEL,
  TYPE_COLORS,
  TYPE_LABELS,
} from '@nvg/shared';

import './ItemTooltip.css';

interface ItemTooltipProps {
  entry: InventoryEntry;
}

export const ItemTooltip = ({ entry }: ItemTooltipProps) => {
  const { item, quantity } = entry;
  const rarityKey = item.rarity ?? 'LOW';
  const rarityColor = RARITY_COLORS[rarityKey] ?? 'text-slate-400';
  const rarityLabel = RARITY_LABELS[rarityKey] ?? rarityKey;
  const rarityBg = RARITY_BG[rarityKey] ?? '';
  const subtypeLabel = SUBTYPE_LABEL[item.subType] ?? item.subType;

  return (
    <div className="space-y-2">
      {/* Name */}
      <p className={`text-sm font-bold ${rarityColor}`}>{item.name}</p>

      {/* Type / Subtype row */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            TYPE_COLORS[item.type as ItemType] ?? 'text-slate-400'
          } bg-slate-800`}
        >
          {TYPE_LABELS[item.type as ItemType] ?? item.type}
        </span>
        <span className="text-xs text-slate-400">{subtypeLabel}</span>
      </div>

      {/* Rarity */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${rarityColor} ${rarityBg}`}
        >
          {rarityLabel}
        </span>
        {quantity > 1 && (
          <span className="text-xs text-slate-400">Qty: {quantity}</span>
        )}
        {entry.equipped && (
          <span className="text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-950/40 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(16,185,129,0.2)]">
            Equipped
          </span>
        )}
      </div>

      {/* Stats */}
      {(item.combatScore || item.defenseScore) ? (
        <div className="border-t border-slate-700/50 pt-2 space-y-1">
          {item.combatScore ? (
            <p className="text-xs text-red-400 font-bold flex items-center gap-1">
              <span>⚔️</span> +{item.combatScore} Combat Score
            </p>
          ) : null}
          {item.defenseScore ? (
            <p className="text-xs text-blue-400 font-bold flex items-center gap-1">
              <span>🛡️</span> +{item.defenseScore} Defense Score
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Description */}
      {item.description && (
        <p className="text-xs text-slate-500 italic leading-relaxed border-t border-slate-700/50 pt-2">
          {item.description}
        </p>
      )}
    </div>
  );
};
