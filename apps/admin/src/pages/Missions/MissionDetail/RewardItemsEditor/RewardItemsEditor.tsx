import React from 'react';
import type { MissionRewardItem } from '@mine-me/shared';
import { newRewardItem } from '../../missionForm';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import './RewardItemsEditor.css';

interface RewardItemsEditorProps {
  value: MissionRewardItem[];
  items: Array<{ id: string; name: string }>;
  onChange: (rewardItems: MissionRewardItem[]) => void;
}

/** The item part of a mission's reward: rows shaped like a drop table (an item, a chance in percent, a quantity range). */
const RewardItemsEditor: React.FC<RewardItemsEditorProps> = ({ value, items, onChange }) => {
  const update = (index: number, patch: Partial<MissionRewardItem>) => onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <section className={`reward-items-editor ${panelClass}`} data-testid="reward-items-editor">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Reward Items</h4>
        <p className={hintClass}>Rolled once when the player leaves the mine safely after completing the mission (a chance of 100 always pays).</p>
      </div>
      {value.map((reward, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end" data-testid={`reward-item-${i}`}>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor={`reward-item-id-${i}`} className={labelClass}>Item</label>
            <select id={`reward-item-id-${i}`} aria-label={`Reward ${i + 1} item`} value={reward.itemId} onChange={(e) => update(i, { itemId: e.target.value })} className={`${inputClass} cursor-pointer`}>
              <option value="">Choose an item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`reward-chance-${i}`} className={labelClass}>Chance %</label>
            <input id={`reward-chance-${i}`} aria-label={`Reward ${i + 1} chance`} type="number" min={0} max={100} value={show(reward.chance)} onChange={(e) => update(i, { chance: readNumber(e.target.value) })} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`reward-min-${i}`} className={labelClass}>Min</label>
            <input id={`reward-min-${i}`} aria-label={`Reward ${i + 1} minimum`} type="number" min={1} value={show(reward.minQuantity)} onChange={(e) => update(i, { minQuantity: readNumber(e.target.value) })} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`reward-max-${i}`} className={labelClass}>Max</label>
            <input id={`reward-max-${i}`} aria-label={`Reward ${i + 1} maximum`} type="number" min={1} value={show(reward.maxQuantity)} onChange={(e) => update(i, { maxQuantity: readNumber(e.target.value) })} className={inputClass} />
          </div>
          <div className="sm:col-span-5 flex justify-end">
            <button type="button" aria-label={`Remove reward ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className={dangerButtonClass}>Remove</button>
          </div>
        </div>
      ))}
      {value.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">No reward items: the mission pays coins and XP only.</p>}
      <button type="button" onClick={() => onChange([...value, newRewardItem(items[0]?.id ?? '')])} className={buttonClass}>+ Add Reward Item</button>
    </section>
  );
};

export default RewardItemsEditor;
