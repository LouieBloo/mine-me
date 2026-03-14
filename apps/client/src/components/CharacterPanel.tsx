import type { PlayerState } from '@nvg/shared';

interface Props {
  player: PlayerState | null;
}

export const CharacterPanel = ({ player }: Props) => {
  if (!player) return <div className="p-4 text-slate-500 animate-pulse">Loading Character...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-800 border-r border-slate-700 w-80 shadow-2xl overflow-y-auto">
      <div className="p-6 border-b border-slate-700 bg-slate-800/50">
        <h2 className="text-2xl font-black text-white capitalize drop-shadow-md">
          {player.characterName} <span className="text-slate-400 font-normal">({player.familyName})</span>
        </h2>
        <div className="flex items-center mt-2 space-x-2 text-sm font-semibold tracking-wide text-yellow-500">
          <span className="px-2 py-1 bg-yellow-900/30 rounded text-yellow-500 shadow-inner">
            Level {player.attributes.level}
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
              <span className="font-mono text-sm font-bold text-red-400">
                {player.attributes.age} / 100 yrs
              </span>
            </div>
            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500/50"
                style={{ width: `${(player.attributes.age / 100) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
