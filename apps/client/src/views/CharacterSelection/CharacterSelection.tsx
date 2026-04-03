import React, { useState, useEffect } from 'react';
import { CharacterList } from './CharacterList/CharacterList';
import { CharacterPreview } from './CharacterPreview/CharacterPreview';
import { CreateCharacter } from './CreateCharacter/CreateCharacter';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';
import './CharacterSelection.css';

import { type GameItem } from '@nvg/shared';

export interface Character {
    id: string;
    name: string;
    class: string;
    level: number;
    status: 'ACTIVE' | 'DEAD' | 'RETIRED';
    profession?: string;
    stamina: number;
    maxStamina: number;
    combatScore: number;
    defenseScore: number;
    sol: number;
    lear: number;
    ageInDays: number;
    createdAt: string;
    inventory?: {
        item: GameItem;
        quantity: number;
    }[];
}

export const CharacterSelection: React.FC = () => {
    const { token } = useAuth();
    const { fetchWithAuth } = useApi();
    const [characters, setCharacters] = useState<Character[]>([]);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchCharacters = async () => {
        try {
            const response = await fetchWithAuth('/api/characters');
            const data = await response.json();
            setCharacters(data);
            if (data.length > 0 && !selectedCharacter) {
                setSelectedCharacter(data[0]);
            }
        } catch (err) {
            console.error('Failed to fetch characters', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchCharacters();
        }
    }, [token]);

    const handleCharacterCreated = (newChar: Character) => {
        setCharacters([newChar, ...characters]);
        setSelectedCharacter(newChar);
        setShowCreate(false);
    };

    const handleCharacterRetired = (retiredChar: Character) => {
        setCharacters(prev => prev.map(c => c.id === retiredChar.id ? retiredChar : c));
        setSelectedCharacter(retiredChar);
    };

    return (
        <div className="character-selection-container flex min-h-screen bg-bg-dark">
            {/* Left/Middle: Preview Area */}
            <div className={`flex-1 flex flex-col items-center relative p-8 ${showCreate ? 'justify-start pt-12 pb-24' : 'justify-center h-screen sticky top-0'}`}>
                {showCreate ? (
                    <CreateCharacter 
                        onCreated={handleCharacterCreated} 
                        onCancel={() => setShowCreate(false)} 
                    />
                ) : (
                    <CharacterPreview 
                        character={selectedCharacter} 
                        onRetired={handleCharacterRetired}
                    />
                )}
                
                {!showCreate && (
                    <button 
                        onClick={() => setShowCreate(true)}
                        className="mt-12 px-8 py-3 bg-sol text-slate-900 font-bold rounded-full hover:bg-amber-400 transition-all shadow-lg shadow-sol/20 cursor-pointer"
                    >
                        Create New Character
                    </button>
                )}
            </div>

            {/* Right Side: Character List (Sticky to viewport) */}
            <div className="w-80 bg-panel border-l border-white/5 flex flex-col sticky top-0 h-screen shadow-2xl z-10">
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white tracking-wide">Your Characters</h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <CharacterList 
                        characters={characters} 
                        selectedId={selectedCharacter?.id} 
                        onSelect={setSelectedCharacter} 
                        loading={loading}
                    />
                </div>
                {/* Space for Ads footer placeholder */}
                <div className="h-24 bg-black/20 flex items-center justify-center border-t border-white/5">
                    <span className="text-slate-500 text-xs italic">Advertisement Area</span>
                </div>
            </div>
        </div>
    );
};
