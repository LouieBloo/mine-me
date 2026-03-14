import { CharacterPanel } from '../components/CharacterPanel';
import { InventoryPanel } from '../components/InventoryPanel';
import { PixiCanvas } from '../components/game/PixiCanvas';
import type { PlayerState } from '@nvg/shared';

// Temporary mock state to demonstrate the UI until WebSockets are wired up
const MOCK_PLAYER: PlayerState = {
  id: 'phone_hash_123',
  familyName: 'Stark',
  characterName: 'Arya',
  characterClass: 'Rogue',
  profession: 'Herbalism',
  sol: 1450,
  lear: 3,
  attributes: {
    level: 14,
    combatScore: 120,
    defenseScore: 45,
    stamina: 85,
    maxStamina: 100,
    age: 24
  },
  inventory: {
    slots: 25,
    items: [
      { id: '1', name: 'Aloe', description: 'Heals', type: 'Material', priceSol: 3, rarity: 'Medium' },
      { id: '2', name: 'Iron Dagger', description: 'Sharp', type: 'Weapon', priceSol: 50 },
      { id: '3', name: 'Iron Dagger', description: 'Sharp', type: 'Weapon', priceSol: 50 },
    ]
  },
  gear: {}
};

export const CityView = () => {
  const player = MOCK_PLAYER;

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

        {/* The Actual WebGL Canvas */}
        <div className="flex-1 w-full h-full">
          <PixiCanvas />
        </div>
      </div>

      {/* Right side: Inventory Planner */}
      <InventoryPanel inventory={player.inventory} />
    </div>
  );
};
