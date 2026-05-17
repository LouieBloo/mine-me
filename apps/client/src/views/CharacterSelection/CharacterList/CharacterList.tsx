import React from 'react';
import { type Character } from '../CharacterSelection';
import { calculateLevel } from '@nvg/shared';
import './CharacterList.css';

interface Props {
    characters: Character[];
    selectedId?: string;
    onSelect: (char: Character) => void;
    loading: boolean;
}

export const CharacterList: React.FC<Props> = ({ characters, selectedId, onSelect, loading }) => {
    if (loading) {
        return (
            <div className="p-6 flex flex-col space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (characters.length === 0) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm mt-10">
                No characters found. Create one to begin your journey!
            </div>
        );
    }

    return (
        <div className="character-list-content flex flex-col space-y-2 p-4">
            {characters.map((char) => (
                <button
                    key={char.id}
                    onClick={() => onSelect(char)}
                    className={`p-4 rounded-xl text-left transition-all group flex flex-col cursor-pointer ${
                        selectedId === char.id 
                        ? 'bg-sol/10 border border-sol/30 shadow-lg shadow-sol/5' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                >
                    <span className={`font-bold transition-colors ${
                        selectedId === char.id ? 'text-sol' : 'text-slate-200 group-hover:text-white'
                    }`}>
                        {char.name}
                    </span>
                    <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                            LVL {calculateLevel(char.experience)}
                        </span>
                        <span className="text-[10px] text-slate-600">•</span>
                        <span className="text-[10px] text-slate-500 italic">
                            {char.class}
                        </span>
                    </div>
                </button>
            ))}
        </div>
    );
};
