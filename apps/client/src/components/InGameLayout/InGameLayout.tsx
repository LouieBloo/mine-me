import { useEffect, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { CharacterPanel } from '../CharacterPanel/CharacterPanel';
import { InventoryPanel } from '../InventoryPanel/InventoryPanel';
import { ChatPanel } from '../ChatPanel/ChatPanel';
import { LoadingSpinner } from '../LoadingSpinner/LoadingSpinner';
import type { PlayerState, GameCity } from '@mine-me/shared';
import './InGameLayout.css';

export const InGameLayout = () => {
    const { user } = useAuth();
    const { activeCharacter, playerState, setActiveCity, displayPlayerHealth } = useGame();
    const { session, retrySession, onEvent } = useSocket();

    // City room join/leave and character selection are owned by the socket session (SocketContext);
    // this layout only waits for it. Once it has been ready once, later drops show a banner instead of
    // unmounting the screen (e.g. a running mine).
    const hasBeenReadyRef = useRef(false);
    if (session.status === 'ready') hasBeenReadyRef.current = true;

    // city_data arrives after join_city — update activeCity in GameContext.
    useEffect(() => {
        const cleanup = onEvent('city_data', (incoming: GameCity) => {
            console.log('[InGameLayout] city_data received:', incoming.name);
            setActiveCity(incoming);
        });
        return cleanup;
    }, [onEvent, setActiveCity]);

    if (!activeCharacter) {
        return <Navigate to="/characters" replace />;
    }

    if (!hasBeenReadyRef.current) {
        if (session.status === 'error') {
            return (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-900 text-center">
                    <p className="text-lg font-bold text-red-400">Could not connect to the game</p>
                    <p className="max-w-md text-sm text-slate-400">{session.error}</p>
                    <button
                        onClick={retrySession}
                        className="cursor-pointer rounded bg-amber-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-amber-500 active:scale-95"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return (
            <LoadingSpinner
                message={session.status === 'connecting' ? 'Connecting...' : 'Loading your character...'}
            />
        );
    }

    // Prefer the authoritative socket-pushed state.
    // Fall back to assembling from the HTTP character record while the socket loads.
    const player: PlayerState = playerState ?? {
        id: activeCharacter.id,
        familyName: user?.familyName || 'Unknown',
        characterName: activeCharacter.name,
        characterClass: activeCharacter.class as any,
        profession: (activeCharacter as any).profession || undefined,
        status: (activeCharacter as any).status || 'ACTIVE',
        sol: activeCharacter.sol,
        lear: activeCharacter.lear,
        cityId: activeCharacter.cityId,
        attributes: {
            combatScore: activeCharacter.combatScore,
            defenseScore: activeCharacter.defenseScore,
            health: (activeCharacter as any).health || 100,
            maxHealth: (activeCharacter as any).maxHealth || 100,
            stamina: activeCharacter.stamina,
            maxStamina: activeCharacter.maxStamina,
            ageInDays: activeCharacter.ageInDays,
            experience: activeCharacter.experience || 0,
        },
        inventory: {
            slots: 25,
            items: (activeCharacter.inventory ?? []).map(inv => ({
                id: inv.id,
                item: inv.item,
                quantity: inv.quantity,
                equipped: (inv as any).equipped ?? false,
            })),
        },
        gear: {
            head: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'HEAD')?.item as any,
            shoulders: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'SHOULDERS')?.item as any,
            chest: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'CHEST')?.item as any,
            gauntlets: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'GAUNTLETS')?.item as any,
            leggings: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'LEGGINGS')?.item as any,
            boots: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'BOOTS')?.item as any,
            weapon: (activeCharacter.inventory ?? []).find(inv => (inv as any).equipped && inv.item.type === 'GEAR' && inv.item.subType === 'WEAPON')?.item as any,
        },
    };

    const playerWithDelayedHealth = {
        ...player,
        attributes: {
            ...player.attributes,
            health: displayPlayerHealth !== null ? displayPlayerHealth : player.attributes.health
        }
    };

    return (
        <div className="in-game-layout flex h-full w-full bg-slate-900 overflow-hidden">
            {/* Left side: Character Sheet & Chat */}
            <div className="flex flex-col w-80 h-full border-r border-slate-700">
                <div className="h-[60%] shrink-0 overflow-y-auto">
                    <CharacterPanel player={playerWithDelayedHealth} />
                </div>
                <div className="h-[40%] shrink-0">
                    <ChatPanel />
                </div>
            </div>

            {/* Center: Dynamic Game Content */}
            <div className="flex-1 relative flex flex-col overflow-hidden">
                {session.status !== 'ready' && (
                    <div
                        role="status"
                        className="absolute left-1/2 top-2 z-50 -translate-x-1/2 rounded bg-amber-600/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow"
                    >
                        {session.status === 'error' ? (
                            <button className="cursor-pointer underline" onClick={retrySession}>Connection lost - retry</button>
                        ) : (
                            'Reconnecting...'
                        )}
                    </div>
                )}
                <Outlet />
            </div>

            {/* Right side: Inventory */}
            <InventoryPanel inventory={player.inventory} />
        </div>
    );
};
