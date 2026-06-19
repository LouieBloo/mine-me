import { useEffect, useRef } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { CharacterPanel } from '../CharacterPanel/CharacterPanel';
import { InventoryPanel } from '../InventoryPanel/InventoryPanel';
import { ChatPanel } from '../ChatPanel/ChatPanel';
import type { PlayerState, GameCity, CityDungeonInfo } from '@nvg/shared';
import './InGameLayout.css';

export const InGameLayout = () => {
    const { user } = useAuth();
    const { activeCharacter, playerState, setActiveCity, setCityDungeonInfo, displayPlayerHealth } = useGame();
    const { joinCity, leaveCity, onEvent } = useSocket();
    const cityIdRef = useRef<string | null>(null);
    const joinedCityIdRef = useRef<string | null>(null);

    // -----------------------------------------------------------------------
    // City room join/leave
    //
    // Managed here (instead of HomeView) because InGameLayout wraps both the
    // /home and /combat routes.  This prevents the socket from leaving the
    // city room when the player navigates into a dungeon and back.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!activeCharacter?.cityId || !activeCharacter?.id) return;

        const cityId = activeCharacter.cityId;

        // Idempotency guard: prevent double-joining same city (Strict Mode remount).
        if (joinedCityIdRef.current === cityId) return;

        cityIdRef.current = cityId;
        joinedCityIdRef.current = cityId;

        joinCity(cityId, activeCharacter.id)
            .catch((err) => {
                console.error('[InGameLayout] Failed to join city:', err.message);
            });

        return () => {
            if (cityIdRef.current) {
                leaveCity(cityIdRef.current).catch(() => {});
                cityIdRef.current = null;
                // Intentionally NOT resetting joinedCityIdRef here so the
                // StrictMode re-mount doesn't double-join.
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCharacter?.cityId, activeCharacter?.id]);

    // city_data arrives after join_city — update activeCity in GameContext.
    useEffect(() => {
        const cleanup = onEvent('city_data', (incoming: GameCity) => {
            console.log('[InGameLayout] city_data received:', incoming.name);
            setActiveCity(incoming);
        });
        return cleanup;
    }, [onEvent, setActiveCity]);

    // city_dungeons arrives after join_city — update cityDungeonInfo in GameContext.
    useEffect(() => {
        const cleanup = onEvent('city_dungeons', (info: CityDungeonInfo) => {
            console.log('[InGameLayout] city_dungeons received:', info.dungeons.length, 'dungeons');
            setCityDungeonInfo(info);
        });
        return cleanup;
    }, [onEvent, setCityDungeonInfo]);

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
                <Outlet />
            </div>

            {/* Right side: Inventory */}
            <InventoryPanel inventory={player.inventory} />
        </div>
    );
};
