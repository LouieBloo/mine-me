import React from 'react';
import {
  DEFAULT_DOODAD_GROUP_FILL, DEFAULT_DOODAD_GROUP_SIZE_MAX, DEFAULT_DOODAD_GROUP_SIZE_MIN, DEFAULT_DOODAD_GROUP_SPREAD,
  resolveDoodadGroups, type DoodadSpawnRules,
} from '@mine-me/shared';
import { hintClass, inputClass, labelClass, panelClass, show } from '../panelStyles';
import './DoodadGroupsPanel.css';

interface DoodadGroupsPanelProps {
  value: DoodadSpawnRules;
  onChange: (value: DoodadSpawnRules) => void;
}

/** A share stored as 0-1 is typed as a percentage. */
const percent = (share: number | null | undefined): number | '' => (typeof share === 'number' && Number.isFinite(share) ? Math.round(share * 100) : '');
const optional = (raw: string): number | null => (raw === '' ? null : Number(raw));
const share = (raw: string): number | null => (raw === '' ? null : Number(raw) / 100);

/** One line saying what the settings do, so the numbers are not a puzzle. */
export function groupSummary(value: DoodadSpawnRules): string {
  const groups = resolveDoodadGroups(value);
  if (!groups) return 'Scattered: every one is placed on its own, anywhere it fits.';
  const size = groups.sizeMin === groups.sizeMax ? `${groups.sizeMin}` : `${groups.sizeMin} to ${groups.sizeMax}`;
  const lone = Math.round((1 - groups.chance) * 100);
  return `${Math.round(groups.chance * 100)}% stand in groups of ${size}, spread up to ${groups.spread} blocks along a surface, filling about ${Math.round(groups.fill * 100)}% of the free spots${lone > 0 ? `; the other ${lone}% stand alone` : ''}.`;
}

/**
 * How the doodad clusters. With no group share it is scattered, one roll per spot, as bugs and lone crystals are. Mushrooms
 * want most of them in small groups; grass wants big groups that run together into a meadow. The biome link's density below
 * decides how many groups there are and how full they are.
 */
const DoodadGroupsPanel: React.FC<DoodadGroupsPanelProps> = ({ value, onChange }) => {
  const set = (patch: Partial<DoodadSpawnRules>) => onChange({ ...value, ...patch });
  const grouping = resolveDoodadGroups(value) !== null;

  return (
    <div className={`doodad-groups-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Groups</h4>
        <p className="text-xs text-slate-500 font-medium">Whether this doodad stands alone or in clumps. Leave the share empty for plain scatter. Big groups with a high fill make a meadow.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="space-y-1">
          <label htmlFor="group-chance" className={labelClass}>In Groups (%)</label>
          <input id="group-chance" type="number" min={0} max={100} step={5} placeholder="0" value={percent(value.groupChance)} onChange={(e) => set({ groupChance: share(e.target.value) })} className={inputClass} />
          <span className={hintClass}>Share that stand in a group. The rest stand alone.</span>
        </div>
        {grouping && (
          <>
            <div className="space-y-1">
              <label htmlFor="group-size-min" className={labelClass}>Smallest Group</label>
              <input id="group-size-min" type="number" min={1} step={1} placeholder={String(DEFAULT_DOODAD_GROUP_SIZE_MIN)} value={show(value.groupSizeMin)} onChange={(e) => set({ groupSizeMin: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>How many, at least. A short surface gives fewer.</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="group-size-max" className={labelClass}>Largest Group</label>
              <input id="group-size-max" type="number" min={1} step={1} placeholder={String(DEFAULT_DOODAD_GROUP_SIZE_MAX)} value={show(value.groupSizeMax)} onChange={(e) => set({ groupSizeMax: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>How many, at most.</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="group-spread" className={labelClass}>Spread</label>
              <input id="group-spread" type="number" min={0} step={1} placeholder={String(DEFAULT_DOODAD_GROUP_SPREAD)} value={show(value.groupSpread)} onChange={(e) => set({ groupSpread: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>How far from the middle a group reaches along the floor, ceiling or wall, in blocks.</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="group-fill" className={labelClass}>Fill (%)</label>
              <input id="group-fill" type="number" min={0} max={100} step={5} placeholder={String(Math.round(DEFAULT_DOODAD_GROUP_FILL * 100))} value={percent(value.groupFill)} onChange={(e) => set({ groupFill: share(e.target.value) })} className={inputClass} />
              <span className={hintClass}>How much of the free spots in reach get one. High is a meadow, low is a loose clump.</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="group-member-spacing" className={labelClass}>Gap Inside A Group</label>
              <input id="group-member-spacing" type="number" min={0} step={1} placeholder="0" value={show(value.memberSpacing)} onChange={(e) => set({ memberSpacing: optional(e.target.value) })} className={inputClass} />
              <span className={hintClass}>Least space between two in the same group, in blocks. Minimum Spacing above only keeps different groups apart.</span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1 max-w-xs">
        <label htmlFor="spawn-max-count" className={labelClass}>Most On The Map</label>
        <input id="spawn-max-count" type="number" min={0} step={1} placeholder="No limit of its own" value={show(value.maxCount)} onChange={(e) => set({ maxCount: optional(e.target.value) })} className={inputClass} />
        <span className={hintClass}>A limit for this doodad alone, so a plentiful one like grass cannot use up the map's whole budget.</span>
      </div>

      <p className="text-xs font-semibold text-slate-600" data-testid="group-summary">{groupSummary(value)}</p>
    </div>
  );
};

export default DoodadGroupsPanel;
