import React, { createContext, useState, useContext, type ReactNode } from 'react';
import type { Character } from '../views/CharacterSelection/CharacterSelection';
import type { GameCity } from '@nvg/shared';

interface GameContextType {
    activeCharacter: Character | null;
    setActiveCharacter: (character: Character | null) => void;
    activeCity: GameCity | null;
    setActiveCity: (city: GameCity | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeCharacter, setActiveCharacterState] = useState<Character | null>(() => {
        const saved = localStorage.getItem('nvg_active_character');
        return saved ? JSON.parse(saved) : null;
    });

    const [activeCity, setActiveCity] = useState<GameCity | null>(null);

    const setActiveCharacter = (char: Character | null) => {
        setActiveCharacterState(char);
        // Changing character clears city state
        setActiveCity(null);
        if (char) {
            localStorage.setItem('nvg_active_character', JSON.stringify(char));
        } else {
            localStorage.removeItem('nvg_active_character');
        }
    };

    return (
        <GameContext.Provider value={{ activeCharacter, setActiveCharacter, activeCity, setActiveCity }}>
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
