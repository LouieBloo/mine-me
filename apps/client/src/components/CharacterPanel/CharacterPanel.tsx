import type { PlayerState } from '@nvg/shared';
import { useLevelProgress } from '../../hooks/useLevels';
import './CharacterPanel.css';

interface Props {
  player: PlayerState | null;
}

export const CharacterPanel = ({ player }: Props) => {
  const levelInfo = useLevelProgress(player?.attributes.experience ?? 0);

  if (!player) return <div className="p-4 text-slate-500 animate-pulse">Loading Character...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-800 w-full overflow-y-auto overflow-x-hidden">
      <div className="p-6 border-b border-slate-700 bg-slate-800/50">
        <h2 className="text-2xl font-black text-white capitalize drop-shadow-md">
          {player.characterName} <span className="text-slate-400 font-normal">({player.familyName})</span>
        </h2>
        <div className="flex items-center mt-2 space-x-2 text-sm font-semibold tracking-wide text-yellow-500">
          <span className="px-2 py-1 bg-yellow-900/30 rounded text-yellow-500 shadow-inner">
            Level {levelInfo.loading ? '...' : levelInfo.level}
          </span>
          <span className="px-2 py-1 bg-slate-900 rounded text-slate-300">
            {player.characterClass}
          </span>
          {player.profession && (
            <span className="px-2 py-1 bg-emerald-900/30 rounded text-emerald-400 shadow-inner">
              {player.profession}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Experience / Level Progress */}
        <div className="space-y-2 p-3 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Experience</span>
            <span className="font-mono text-sm font-bold text-white">
              {levelInfo.loading ? (
                <span className="text-slate-500 animate-pulse">Loading...</span>
              ) : levelInfo.isMaxLevel ? (
                <span className="text-amber-400">MAX LEVEL</span>
              ) : (
                <>{levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpNeededForNext.toLocaleString()} XP</>
              )}
            </span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700/30">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-700 ease-out rounded-full shadow-[0_0_8px_rgba(34,211,238,0.4)]"
              style={{ width: `${levelInfo.loading ? 0 : levelInfo.progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Lv. {levelInfo.loading ? '...' : levelInfo.level}</span>
            <span className="text-slate-600">{player.attributes.experience.toLocaleString()} total XP</span>
            {!levelInfo.loading && !levelInfo.isMaxLevel && <span>Lv. {levelInfo.level + 1}</span>}
          </div>
        </div>

        {/* Currencies */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col p-3 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sol</span>
            <span className="text-xl font-bold text-yellow-500">{player.sol.toLocaleString()}</span>
          </div>
          <div className="flex flex-col p-3 bg-slate-900 rounded-lg shadow-inner border border-slate-700/50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lear</span>
            <span className="text-xl font-bold text-emerald-500">{player.lear.toLocaleString()}</span>
          </div>
        </div>

        {/* Core Attributes */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase">Attributes</h3>
          
          <div className="flex justify-between items-center p-2 rounded hover:bg-slate-700/30 transition-colors">
            <span className="text-slate-300">Combat Score</span>
            <span className="font-mono text-lg font-bold text-white">{player.attributes.combatScore}</span>
          </div>
          
          <div className="flex justify-between items-center p-2 rounded hover:bg-slate-700/30 transition-colors">
            <span className="text-slate-300">Defense Score</span>
            <span className="font-mono text-lg font-bold text-white">{player.attributes.defenseScore}</span>
          </div>

          <div className="space-y-2 p-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Stamina</span>
              <span className="font-mono text-sm font-bold text-white">
                {player.attributes.stamina} / {player.attributes.maxStamina}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${(player.attributes.stamina / player.attributes.maxStamina) * 100}%` }}
              />
            </div>
          </div>
          
          <div className="space-y-2 p-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Age</span>
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
                      <span className={`font-mono text-xs font-bold ${subColorClass} uppercase tracking-tighter`}>
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
