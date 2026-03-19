import { CharacterPanel } from '../../components/CharacterPanel/CharacterPanel';
import { InventoryPanel } from '../../components/InventoryPanel/InventoryPanel';
import { Navigate } from 'react-router-dom';
import type { PlayerState } from '@nvg/shared';
import { useGame } from '../../contexts/GameContext';
import { useAuth } from '../../hooks/useAuth';
import './HomeView.css';

export const HomeView = () => {
  const { activeCharacter } = useGame();
  const { user } = useAuth();

  if (!activeCharacter) {
    return <Navigate to="/characters" replace />;
  }

  // Map the backend character to the PlayerState the UI expects
  const player: PlayerState = {
    id: activeCharacter.id,
    familyName: user?.familyName || 'Unknown',
    characterName: activeCharacter.name,
    characterClass: activeCharacter.class as any,
    profession: activeCharacter.profession as any,
    sol: activeCharacter.sol,
    lear: activeCharacter.lear,
    attributes: {
      level: activeCharacter.level,
      combatScore: activeCharacter.combatScore,
      defenseScore: activeCharacter.defenseScore,
      stamina: activeCharacter.stamina,
      maxStamina: activeCharacter.maxStamina,
      ageInDays: activeCharacter.ageInDays
    },
    inventory: {
      slots: 25,
      items: [] // Invertory will be fetched separately later
    },
    gear: {}
  };

  return (
    <div className="flex h-full w-full bg-slate-900 overflow-hidden">
      {/* Left side: Character Sheet */}
      <CharacterPanel player={player} />
      
      {/* Center: Game Canvas (PixiJS) */}
      <div className="flex-1 relative flex flex-col">
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

      {/* Right side: Inventory Planner */}
      <InventoryPanel inventory={player.inventory} />
    </div>
  );
};
