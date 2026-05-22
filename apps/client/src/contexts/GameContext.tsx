import React, { createContext, useState, useContext, type ReactNode } from 'react';
import type { Character } from '../views/CharacterSelection/CharacterSelection';
import type { GameCity, PlayerState, CharacterStatUpdate, CityDungeonInfo } from '@nvg/shared';

interface GameContextType {
    activeCharacter: Character | null;
    setActiveCharacter: (character: Character | null) => void;
    activeCity: GameCity | null;
    setActiveCity: (city: GameCity | null) => void;
    /** Authoritative character state pushed from the server via the socket. */
    playerState: PlayerState | null;
    setPlayerState: (state: PlayerState | null) => void;
    /** Current active battle state. */
    battleState: any | null; // using any temporarily or import BattleState
    setBattleState: (state: any | null) => void;
    /** Dungeon info for the current city (dungeons + cleared levels). */
    cityDungeonInfo: CityDungeonInfo | null;
    setCityDungeonInfo: (info: CityDungeonInfo | null) => void;
    /** Merge a partial stat update into the existing playerState. */
    applyStatUpdate: (updates: CharacterStatUpdate) => void;
    /** Call on logout to clear all game state. */
    clearGameState: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// Helper to safely parse JSON from localStorage
function readLocalStorage<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeCharacter, setActiveCharacterState] = useState<Character | null>(() =>
        readLocalStorage<Character>('nvg_active_character')
    );

    // Restore city from persisted playerState so we never flash "Loading..."
    const [playerState, setPlayerStateRaw] = useState<PlayerState | null>(() =>
        readLocalStorage<PlayerState>('nvg_player_state')
    );

    const [activeCity, setActiveCity] = useState<GameCity | null>(() => {
        const ps = readLocalStorage<PlayerState>('nvg_player_state');
        return ps?.city ?? null;
    });

    const [battleState, setBattleState] = useState<any | null>(null);
    const [cityDungeonInfo, setCityDungeonInfo] = useState<CityDungeonInfo | null>(null);

    // Wrap setPlayerState so we also persist it
    const setPlayerState = (state: PlayerState | null) => {
        setPlayerStateRaw(state);
        if (state) {
            localStorage.setItem('nvg_player_state', JSON.stringify(state));
            // Also keep activeCity in sync from the authoritative state
            if (state.city) setActiveCity(state.city);
        } else {
            localStorage.removeItem('nvg_player_state');
        }
    };

    // Merge a partial stat update into the existing playerState.
    // Fields in CharacterStatUpdate map to either top-level (sol, lear, cityId)
    // or nested attributes (level, combatScore, stamina, ageInDays, etc.).
    const applyStatUpdate = (updates: CharacterStatUpdate) => {
        if (updates.status === 'DEAD') {
            setActiveCharacterState(null);
            localStorage.removeItem('nvg_active_character');
        }
        setPlayerStateRaw(prev => {
            if (!prev) return prev;

            const { sol, lear, cityId, inventory, status, ...attrUpdates } = updates as any;
            const next: PlayerState = {
                ...prev,
                ...(sol !== undefined && { sol }),
                ...(lear !== undefined && { lear }),
                ...(cityId !== undefined && { cityId }),
                ...(inventory !== undefined && { inventory }),
                ...(status !== undefined && { status }),
                attributes: {
                    ...prev.attributes,
                    ...attrUpdates,
                },
            };

            localStorage.setItem('nvg_player_state', JSON.stringify(next));
            return next;
        });
    };

    // setActiveCharacter ONLY updates the active character + localStorage.
    // It must NOT wipe playerState — city switching would hit this path and
    // that must not discard the inventory or any other socket-pushed state.
    const setActiveCharacter = (char: Character | null) => {
        setActiveCharacterState(char);
        if (char) {
            localStorage.setItem('nvg_active_character', JSON.stringify(char));
        } else {
            localStorage.removeItem('nvg_active_character');
        }
    };

    // Call this on full logout to wipe everything
    const clearGameState = () => {
        setActiveCharacterState(null);
        setPlayerStateRaw(null);
        setActiveCity(null);
        setCityDungeonInfo(null);
        localStorage.removeItem('nvg_active_character');
        localStorage.removeItem('nvg_player_state');
    };

    return (
        <GameContext.Provider value={{
            activeCharacter,
            setActiveCharacter,
            activeCity,
            setActiveCity,
            playerState,
            setPlayerState,
            battleState,
            setBattleState,
            cityDungeonInfo,
            setCityDungeonInfo,
            applyStatUpdate,
            clearGameState,
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};
