import React from 'react';
import { Modal } from '../Modal/Modal';
import type { CityDungeonInfo } from '@nvg/shared';
import './DungeonModal.css';

interface DungeonModalProps {
  dungeonInfo: CityDungeonInfo;
  onSelectDungeon: (dungeonLevelId: string) => void;
  onClose: () => void;
  loading?: boolean;
  characterLevel?: number;
}

/**
 * Modal to display the dungeons available in the current city.
 * Shows each dungeon with its name, level requirement, and completion status.
 * A dungeon is "complete" when ALL of its levels have been cleared.
 */
export const DungeonModal: React.FC<DungeonModalProps> = ({
  dungeonInfo,
  onSelectDungeon,
  onClose,
  loading = false,
}) => {
  const { dungeons, clearedLevelIds } = dungeonInfo;
  const clearedSet = new Set(clearedLevelIds);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Dungeons"
      maxWidthClass="w-full max-w-3xl"
    >
      {dungeons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm font-bold uppercase tracking-widest">No dungeons in this city</p>
        </div>
      ) : (
        <div className="dungeon-modal-grid">
          {dungeons.map((cd) => {
            const dungeon = cd.dungeon;
            if (!dungeon) return null;

            const levels = dungeon.levels ?? [];
            const totalLevels = levels.length;
            const clearedLevels = levels.filter(l => clearedSet.has(l.id)).length;
            const isComplete = totalLevels > 0 && clearedLevels === totalLevels;

            // Pick the first uncleared level, or the first level if all cleared (replay)
            const targetLevel = levels.find(l => !clearedSet.has(l.id)) ?? levels[0];

            return (
              <button
                key={cd.id}
                disabled={loading || !targetLevel}
                onClick={() => targetLevel && onSelectDungeon(targetLevel.id)}
                className={`relative flex flex-col items-center p-6 rounded-xl border-2 transition-all cursor-pointer group
                  ${isComplete
                    ? 'border-emerald-500/50 bg-emerald-950/20 hover:border-emerald-400 hover:bg-emerald-950/40'
                    : 'border-slate-700 bg-slate-800/50 hover:border-amber-500 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                  }
                  active:scale-95 disabled:active:scale-100
                `}
              >
                {/* Dungeon Icon */}
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl mb-3 transition-all
                  ${isComplete
                    ? 'bg-emerald-900/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-700/50 group-hover:bg-amber-900/30 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  }
                `}>
                  {isComplete ? '✅' : '🏰'}
                </div>

                {/* Dungeon Name */}
                <h3 className={`text-sm font-black uppercase tracking-widest text-center mb-1 transition-colors
                  ${isComplete ? 'text-emerald-400' : 'text-slate-200 group-hover:text-amber-400'}
                `}>
                  {dungeon.name}
                </h3>

                {/* Level Requirement */}
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-500">
                  Level {dungeon.minLevel}+
                </p>

                {/* Completion Progress */}
                {totalLevels > 0 && (
                  <div className="w-full mt-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        {isComplete ? 'Cleared' : `${clearedLevels}/${totalLevels} Levels`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${totalLevels > 0 ? (clearedLevels / totalLevels) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Loading overlay */}
                {loading && (
                  <div className="absolute inset-0 bg-slate-900/60 rounded-xl flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
