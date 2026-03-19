import React from 'react';
import { useNavigate } from 'react-router-dom';
import { type Character } from '../CharacterSelection';
import { useGame } from '../../../contexts/GameContext';
import './CharacterPreview.css';

interface Props {
    character: Character | null;
}

export const CharacterPreview: React.FC<Props> = ({ character }) => {
    const navigate = useNavigate();
    const { setActiveCharacter } = useGame();

    if (!character) {
        return (
            <div className="flex flex-col items-center justify-center text-slate-500">
                <div className="w-32 h-32 rounded-full bg-white/5 border border-dashed border-white/10 flex items-center justify-center mb-4">
                    <span className="text-4xl">?</span>
                </div>
                <p>Select a character to preview</p>
            </div>
        );
    }

    const handlePlay = () => {
        if (character) {
            setActiveCharacter(character);
            navigate('/home');
        }
    };

    return (
        <div className="character-preview-content flex flex-col items-center animate-in fade-in zoom-in duration-300">
            {/* Character Icon Placeholder */}
            <div className="relative group mb-8">
                <div className="absolute -inset-1 bg-gradient-to-r from-sol to-amber-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative w-48 h-48 rounded-full bg-slate-800 border-2 border-sol/50 flex items-center justify-center shadow-2xl">
                    <span className="text-8xl">{character.status === 'DEAD' ? '💀' : '👤'}</span>
                </div>
                <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-sol text-slate-900 flex items-center justify-center font-bold text-lg border-4 border-slate-900 shadow-lg">
                    {character.level}
                </div>
                
                {/* Status Badge */}
                {character.status === 'DEAD' && (
                    <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg transform translate-x-1/2 -translate-y-1/2">
                        Deceased
                    </div>
                )}
            </div>

            <h1 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic">
                {character.name}
            </h1>
            <p className="text-sol font-semibold uppercase tracking-[0.2em] mb-8">
                Master {character.class}
            </p>

            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold mb-1">Profession</span>
                    <span className="text-white font-medium">{character.profession || 'None'}</span>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                    <span className="block text-slate-500 text-[10px] uppercase font-bold mb-1">Status</span>
                    <span className={`${character.status === 'DEAD' ? 'text-red-500' : 'text-emerald-500'} font-bold uppercase text-xs tracking-widest`}>
                        {character.status}
                    </span>
                </div>
            </div>

            <button 
                onClick={handlePlay}
                disabled={character.status === 'DEAD'}
                className={`mt-12 w-full max-w-xs py-4 ${character.status === 'DEAD' ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-sol to-amber-600 text-slate-900 font-black hover:scale-105 cursor-pointer'} uppercase tracking-widest rounded-xl transition-all shadow-2xl shadow-sol/20`}
            >
                {character.status === 'DEAD' ? 'Character Interred' : 'Enter World'}
            </button>
        </div>
    );
};
