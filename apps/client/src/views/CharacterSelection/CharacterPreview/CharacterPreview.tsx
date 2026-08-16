import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { type Character } from '../CharacterSelection';
import { useGame } from '../../../contexts/GameContext';
import { type GearSubType } from '@mine-me/shared';
import { useCharacterLevel } from '../../../hooks/useLevels';
import { PixiStageProvider } from '../../../components/game/PixiStageContext/PixiStageContext';
import { SpriteRenderer } from '../../../components/game/SpriteRenderer/SpriteRenderer';
import './CharacterPreview.css';
import { ConfirmationModal } from '../../../components/ConfirmationModal/ConfirmationModal';

interface Props {
    character: Character | null;
    onRetired: (retiredChar: Character) => void;
}

export const CharacterPreview: React.FC<Props> = ({ character, onRetired }) => {
    const navigate = useNavigate();
    const { fetchWithAuth } = useApi();
    const { setActiveCharacter } = useGame();
    const level = useCharacterLevel(character?.experience ?? 0);
    const [retiring, setRetiring] = useState(false);
    const [showRetireConfirm, setShowRetireConfirm] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ isOpen: false, title: '', message: '' });

    const gearLayers = React.useMemo(() => {
        if (!character?.inventory) return [];
        return character.inventory
            .filter(inv => inv.item.type === 'GEAR' && inv.item.gearImageUrl)
            .map(inv => ({
                url: `${import.meta.env.VITE_API_URL || ''}${inv.item.gearImageUrl}`,
                subType: inv.item.subType as GearSubType,
            }));
    }, [character?.inventory]);

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

    const handleRetire = async () => {
        if (!character) return;
        
        setRetiring(true);
        try {
            const response = await fetchWithAuth(`/api/characters/${character.id}/retire`, {
                method: 'PATCH',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to retire character');
            }

            const updatedChar = await response.json();
            onRetired(updatedChar);
        } catch (err: any) {
            setAlertInfo({
                isOpen: true,
                title: 'Retirement Failed',
                message: err.message
            });
        } finally {
            setRetiring(false);
            setShowRetireConfirm(false);
        }
    };

    return (
        <div className="character-preview-content flex flex-col items-center animate-in fade-in zoom-in duration-300">
            {/* Character Icon Placeholder */}
            <div className="relative group mb-8">
                <div className="absolute -inset-1 bg-gradient-to-r from-sol to-amber-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative w-48 h-48 rounded-full bg-slate-800 border-2 border-sol/50 overflow-hidden flex items-center justify-center shadow-2xl">
                    <PixiStageProvider className="w-full h-full flex items-center justify-center">
                        <SpriteRenderer
                            type="modular"
                            gearLayers={gearLayers}
                            width={192}
                            height={192}
                        />
                    </PixiStageProvider>
                </div>
                <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-sol text-slate-900 flex items-center justify-center font-bold text-lg border-4 border-slate-900 shadow-lg">
                    {level ?? '...'}
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
                    <span className={`${character.status === 'DEAD' ? 'text-red-500' : character.status === 'RETIRED' ? 'text-amber-500' : 'text-emerald-500'} font-bold uppercase text-xs tracking-widest`}>
                        {character.status}
                    </span>
                </div>
            </div>

            <div className="flex flex-col w-full max-w-xs gap-3 mt-12">
                <button 
                    onClick={handlePlay}
                    disabled={character.status !== 'ACTIVE'}
                    className={`w-full py-4 ${character.status !== 'ACTIVE' ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-sol to-amber-600 text-slate-900 font-black hover:scale-105 cursor-pointer'} uppercase tracking-widest rounded-xl transition-all shadow-2xl shadow-sol/20`}
                >
                    {character.status === 'DEAD' ? 'Character Interred' : character.status === 'RETIRED' ? 'Character Retired' : 'Enter World'}
                </button>

                {character.status === 'ACTIVE' && (
                    <button
                        onClick={() => setShowRetireConfirm(true)}
                        disabled={retiring}
                        className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold uppercase tracking-widest rounded-xl transition-all text-xs cursor-pointer"
                    >
                        {retiring ? 'Retiring...' : 'Retire Character'}
                    </button>
                )}
            </div>

            {/* Retirement Confirmation */}
            <ConfirmationModal
                isOpen={showRetireConfirm}
                onClose={() => setShowRetireConfirm(false)}
                onConfirm={handleRetire}
                isLoading={retiring}
                title="Retire Character"
                message={`Are you sure you want to retire ${character.name}? This cannot be undone, and they will no longer be playable.`}
                confirmLabel="Retire Forever"
                cancelLabel="Keep Character"
                variant="danger"
            />

            {/* Error Alert */}
            <ConfirmationModal
                isOpen={alertInfo.isOpen}
                onClose={() => setAlertInfo({ ...alertInfo, isOpen: false })}
                onConfirm={() => setAlertInfo({ ...alertInfo, isOpen: false })}
                title={alertInfo.title}
                message={alertInfo.message}
                confirmLabel="Understood"
                showCancel={false}
                variant="warning"
            />
        </div>
    );
};
