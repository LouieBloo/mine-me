import { useGame } from '../../contexts/GameContext';
import './HomeView.css';

export const HomeView = () => {
  const { activeCharacter } = useGame();

  if (!activeCharacter) {
    return null; // Layout handles redirect
  }

  return (
    <div className="flex-1 relative flex flex-col h-full bg-slate-900 border-x border-slate-800">
      {/* City Header Toolbar */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-slate-900/90 to-transparent z-10 flex items-center justify-between px-8 pointer-events-none">
        <h1 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 drop-shadow-lg uppercase">
          Town of Beginnings
        </h1>
        
        <div className="pointer-events-auto flex space-x-4">
          <button className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-white font-bold rounded shadow-lg backdrop-blur transition-all active:scale-95 border-b-2 border-slate-900">
            Venture into Dungeon
          </button>
          <button className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-white font-bold rounded shadow-lg backdrop-blur transition-all active:scale-95 border-b-2 border-slate-900">
            Marketplace
          </button>
          <button className="px-4 py-2 bg-emerald-800/80 hover:bg-emerald-700 text-white font-bold rounded shadow-lg backdrop-blur transition-all active:scale-95 border-b-2 border-emerald-900">
            Action: Herbalism
          </button>
        </div>
      </div>

      {/* The Actual WebGL Canvas (Disabled for now) */}
      <div className="flex-1 w-full h-full bg-slate-800 flex items-center justify-center">
        <div className="text-slate-500 font-bold uppercase tracking-widest text-xl">
          2D Engine Disabled
        </div>
      </div>
    </div>
  );
};
