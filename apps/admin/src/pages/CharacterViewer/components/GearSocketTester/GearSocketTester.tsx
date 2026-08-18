import React from 'react';
import type { GearSubType } from '@mine-me/shared';
import './GearSocketTester.css';

export interface GearSocketTesterProps {
  items: any[];
  selectedGear: Record<string, string>;
  setSelectedGear: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeGearCount: number;
}

const GEAR_SLOTS: GearSubType[] = [
  'HEAD',
  'SHOULDERS',
  'CHEST',
  'GAUNTLETS',
  'LEGGINGS',
  'BOOTS',
  'WEAPON',
];

export const GearSocketTester: React.FC<GearSocketTesterProps> = ({
  items,
  selectedGear,
  setSelectedGear,
  activeGearCount,
}) => {
  return (
    <div className="gear-socket-tester bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-in fade-in">
      <div>
        <h3 className="font-black text-slate-800 text-base">
          Joint Socket Gear Attachments
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Select gear items from the database to attach directly to the animated joint nodes
          live in the viewer.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GEAR_SLOTS.map((slot) => {
          const availableItems = items.filter(
            (i) => i.type === 'GEAR' && i.subType === slot
          );

          return (
            <div key={slot} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2">
                {slot} Slot
              </label>
              <select
                value={selectedGear[slot] || ''}
                onChange={(e) =>
                  setSelectedGear((prev) => ({ ...prev, [slot]: e.target.value }))
                }
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">-- None Equipped --</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.rarity || 'Common'})
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {activeGearCount > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
          <span className="text-xs font-bold text-blue-800">
            Active Gear Overlays: {activeGearCount} piece(s)
          </span>
          <button
            onClick={() => setSelectedGear({})}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
          >
            Clear All Gear
          </button>
        </div>
      )}
    </div>
  );
};
