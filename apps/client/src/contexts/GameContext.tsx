import React, { createContext, useState, useContext, type ReactNode } from 'react';
import type { Character } from '../views/CharacterSelection/CharacterSelection';

interface GameContextType {
    activeCharacter: Character | null;
    setActiveCharacter: (character: Character | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // For a more robust app, we'd persist this in localStorage or re-fetch on mount based on an ID
    const [activeCharacter, setActiveCharacter] = useState<Character | null>(() => {
        const saved = localStorage.getItem('nvg_active_character');
        return saved ? JSON.parse(saved) : null;
    });

    const handleSetActiveCharacter = (char: Character | null) => {
        setActiveCharacter(char);
        if (char) {
            localStorage.setItem('nvg_active_character', JSON.stringify(char));
        } else {
            localStorage.removeItem('nvg_active_character');
        }
    };

    return (
        <GameContext.Provider value={{ activeCharacter, setActiveCharacter: handleSetActiveCharacter }}>
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
