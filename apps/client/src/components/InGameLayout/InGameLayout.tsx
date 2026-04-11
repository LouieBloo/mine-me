import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { CharacterPanel } from '../CharacterPanel/CharacterPanel';
import { InventoryPanel } from '../InventoryPanel/InventoryPanel';
import type { PlayerState } from '@nvg/shared';
import './InGameLayout.css';

export const InGameLayout = () => {
    const { user } = useAuth();
    const { activeCharacter, playerState } = useGame();

    if (!activeCharacter) {
        return <Navigate to="/characters" replace />;
    }

    // Prefer the authoritative socket-pushed state.
    // Fall back to assembling from the HTTP character record while the socket loads.
    const player: PlayerState = playerState ?? {
        id: activeCharacter.id,
        familyName: user?.familyName || 'Unknown',
        characterName: activeCharacter.name,
        characterClass: activeCharacter.class as any,
        profession: (activeCharacter as any).profession || undefined,
        sol: activeCharacter.sol,
        lear: activeCharacter.lear,
        cityId: activeCharacter.cityId,
        attributes: {
            level: activeCharacter.level,
            combatScore: activeCharacter.combatScore,
            defenseScore: activeCharacter.defenseScore,
            stamina: activeCharacter.stamina,
            maxStamina: activeCharacter.maxStamina,
            ageInDays: activeCharacter.ageInDays,
        },
        inventory: {
            slots: 25,
            items: (activeCharacter.inventory ?? []).map(inv => ({
                item: inv.item,
                quantity: inv.quantity,
            })),
        },
        gear: {},
    };

    return (
        <div className="in-game-layout flex h-full w-full bg-slate-900 overflow-hidden">
            {/* Left side: Character Sheet */}
            <CharacterPanel player={player} />

            {/* Center: Dynamic Game Content */}
            <div className="flex-1 relative flex flex-col overflow-hidden">
                <Outlet />
            </div>

            {/* Right side: Inventory */}
            <InventoryPanel inventory={player.inventory} />
        </div>
    );
};
