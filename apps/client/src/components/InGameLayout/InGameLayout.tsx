import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { CharacterPanel } from '../CharacterPanel/CharacterPanel';
import { InventoryPanel } from '../InventoryPanel/InventoryPanel';
import type { PlayerState } from '@nvg/shared';
import './InGameLayout.css';

export const InGameLayout = () => {
    const { user } = useAuth();
    const { activeCharacter } = useGame();

    if (!activeCharacter) {
        return <Navigate to="/characters" replace />;
    }

    // Map the backend character to the PlayerState the UI expects
    // This logic is centralized here so all "in-game" views have access to correct state
    const player: PlayerState = {
        id: activeCharacter.id,
        familyName: user?.familyName || 'Unknown',
        characterName: activeCharacter.name,
        characterClass: activeCharacter.class as any,
        profession: (activeCharacter as any).profession || undefined,
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
        <div className="in-game-layout flex h-full w-full bg-slate-900 overflow-hidden">
            {/* Left side: Character Sheet */}
            <CharacterPanel player={player} />
            
            {/* Center: Dynamic Game Content */}
            <div className="flex-1 relative flex flex-col overflow-hidden">
                <Outlet />
            </div>

            {/* Right side: Inventory Planner */}
            <InventoryPanel inventory={player.inventory} />
        </div>
    );
};
