import { CharacterModEngine } from '@nvg/shared';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import type { PlayerState } from '@nvg/shared';
import { useLevelProgress } from '../../hooks/useLevels';
import './CharacterPanel.css';

interface Props {
  player: PlayerState | null;
}

export const CharacterPanel = ({ player }: Props) => {
  const levelInfo = useLevelProgress(player?.attributes.experience ?? 0);

  const mods = player ? CharacterModEngine.getModifications(player.inventory?.items ?? []) : { combatScore: 0, defenseScore: 0 };
  const totalCombatScore = player ? player.attributes.combatScore + mods.combatScore : 0;
  const totalDefenseScore = player ? player.attributes.defenseScore + mods.defenseScore : 0;

  if (!player) return <div className="p-4 text-slate-500 animate-pulse">Loading Character...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-800 w-full overflow-y-auto overflow-x-hidden">
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <h2 className="text-xl font-black text-white capitalize drop-shadow-md">
          {player.characterName} <span className="text-slate-400 font-normal text-sm">({player.familyName})</span>
        </h2>
        <div className="flex items-center mt-1.5 space-x-1.5 text-xs font-semibold tracking-wide text-yellow-500">
          <span className="px-1.5 py-0.5 bg-yellow-900/30 rounded text-yellow-500 shadow-inner">
            Level {levelInfo.loading ? '...' : levelInfo.level}
          </span>
          <span className="px-1.5 py-0.5 bg-slate-900 rounded text-slate-300">
            {player.characterClass}
          </span>
          {player.profession && (
            <span className="px-1.5 py-0.5 bg-emerald-900/30 rounded text-emerald-400 shadow-inner">
              {player.profession}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Health */}
        <div className="space-y-1.5 p-2.5 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Health</span>
            <span className="font-mono text-xs font-bold text-white">
              {player.attributes.health.toLocaleString()} / {player.attributes.maxHealth.toLocaleString()} HP
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700/30">
            <div
              className="h-full bg-gradient-to-r from-rose-600 to-rose-500 transition-all duration-700 ease-out rounded-full shadow-[0_0_8px_rgba(244,63,94,0.4)]"
              style={{ width: `${(player.attributes.health / player.attributes.maxHealth) * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            <span>0%</span>
            <span className="text-slate-600">{Math.round((player.attributes.health / player.attributes.maxHealth) * 100)}% HP</span>
            <span>100%</span>
          </div>
        </div>

        {/* Stamina */}
        <div className="space-y-1.5 p-2.5 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Stamina</span>
            <span className="font-mono text-xs font-bold text-white">
              {player.attributes.stamina.toLocaleString()} / {player.attributes.maxStamina.toLocaleString()} SP
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700/30">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-700 ease-out rounded-full shadow-[0_0_8px_rgba(34,211,238,0.4)]"
              style={{ width: `${(player.attributes.stamina / player.attributes.maxStamina) * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            <span>0%</span>
            <span className="text-slate-600">{Math.round((player.attributes.stamina / player.attributes.maxStamina) * 100)}% SP</span>
            <span>100%</span>
          </div>
        </div>

        {/* Experience / Level Progress */}
        <div className="space-y-1.5 p-2.5 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Experience</span>
            <span className="font-mono text-xs font-bold text-white">
              {levelInfo.loading ? (
                <span className="text-slate-500 animate-pulse">Loading...</span>
              ) : levelInfo.isMaxLevel ? (
                <span className="text-amber-400 text-xs">MAX LEVEL</span>
              ) : (
                <>{levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpNeededForNext.toLocaleString()} XP</>
              )}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700/30">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700 ease-out rounded-full shadow-[0_0_8px_rgba(249,115,22,0.4)]"
              style={{ width: `${levelInfo.loading ? 0 : levelInfo.progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Lv. {levelInfo.loading ? '...' : levelInfo.level}</span>
            <span className="text-slate-600">{player.attributes.experience.toLocaleString()} total XP</span>
            {!levelInfo.loading && !levelInfo.isMaxLevel && <span>Lv. {levelInfo.level + 1}</span>}
          </div>
        </div>

        {/* Currencies */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col p-2 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sol</span>
            <span className="text-lg font-bold text-yellow-500">{player.sol.toLocaleString()}</span>
          </div>
          <div className="flex flex-col p-2 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lear</span>
            <span className="text-lg font-bold text-emerald-500">{player.lear.toLocaleString()}</span>
          </div>
        </div>

        {/* Core Attributes */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase px-1">Attributes</h3>

          <HoverTooltip
            content={
              <div className="p-2 text-xs font-semibold text-slate-300 space-y-1">
                <p className="font-bold text-white mb-1">Combat Score Calculation</p>
                <div className="flex justify-between gap-8">
                  <span>Base Score:</span>
                  <span className="font-mono text-white">{player.attributes.combatScore}</span>
                </div>
                <div className="flex justify-between gap-8 text-red-400">
                  <span>Item Bonus:</span>
                  <span className="font-mono">+{mods.combatScore}</span>
                </div>
                <div className="border-t border-slate-700 pt-1 flex justify-between gap-8 font-bold text-white">
                  <span>Total:</span>
                  <span className="font-mono">{totalCombatScore}</span>
                </div>
                <p className="text-[10px] text-slate-500 italic mt-1 font-normal border-t border-slate-800/80 pt-1">
                  {player.attributes.combatScore} base + {mods.combatScore} items
                </p>
              </div>
            }
          >
            <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-700/30 transition-colors cursor-help">
              <span className="text-slate-300 text-sm">Combat Score</span>
              <span className="font-mono text-md font-bold text-white">{totalCombatScore}</span>
            </div>
          </HoverTooltip>

          <HoverTooltip
            content={
              <div className="p-2 text-xs font-semibold text-slate-300 space-y-1">
                <p className="font-bold text-white mb-1">Defense Score Calculation</p>
                <div className="flex justify-between gap-8">
                  <span>Base Score:</span>
                  <span className="font-mono text-white">{player.attributes.defenseScore}</span>
                </div>
                <div className="flex justify-between gap-8 text-blue-400">
                  <span>Item Bonus:</span>
                  <span className="font-mono">+{mods.defenseScore}</span>
                </div>
                <div className="border-t border-slate-700 pt-1 flex justify-between gap-8 font-bold text-white">
                  <span>Total:</span>
                  <span className="font-mono">{totalDefenseScore}</span>
                </div>
                <p className="text-[10px] text-slate-500 italic mt-1 font-normal border-t border-slate-800/80 pt-1">
                  {player.attributes.defenseScore} base + {mods.defenseScore} items
                </p>
              </div>
            }
          >
            <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-slate-700/30 transition-colors cursor-help">
              <span className="text-slate-300 text-sm">Defense Score</span>
              <span className="font-mono text-md font-bold text-white">{totalDefenseScore}</span>
            </div>
          </HoverTooltip>

          <div className="space-y-1 py-1 px-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 text-sm">Age</span>
              <div className="flex flex-col items-end">
                {(() => {
                  const totalDays = player.attributes.ageInDays;
                  const years = Math.floor(totalDays / 360);
                  const months = Math.floor((totalDays % 360) / 30);
                  const days = totalDays % 30;
                  const isOld = years >= 80;
                  const colorClass = isOld ? 'text-red-400' : 'text-emerald-400';
                  const subColorClass = isOld ? 'text-red-500/60' : 'text-emerald-500/60';
                  return (
                    <>
                      <span className={`font-mono text-sm font-bold ${colorClass}`}>
                        {years} yrs
                      </span>
                      <span className={`font-mono text-[10px] font-bold ${subColorClass} uppercase tracking-tighter`}>
                        {months} mos {days} days
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
              <div
                className={`h-full transition-colors duration-500 ${Math.floor(player.attributes.ageInDays / 360) >= 80 ? 'bg-red-500/50' : 'bg-emerald-500/50'}`}
                style={{ width: `${Math.min(100, ((player.attributes.ageInDays / 360) / 100) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
