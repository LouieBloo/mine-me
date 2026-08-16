import React, { useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { type Character } from '../CharacterSelection';
import './CreateCharacter.css';
import { type GameItem, type GearSubType } from '@mine-me/shared';
import { PixiStageProvider } from '../../../components/game/PixiStageContext/PixiStageContext';
import { SpriteRenderer } from '../../../components/game/SpriteRenderer/SpriteRenderer';
import type { GearLayerDescriptor } from '../../../components/game/sprites';

interface Props {
    onCreated: (char: Character) => void;
    onCancel: () => void;
}

export const CreateCharacter: React.FC<Props> = ({ onCreated, onCancel }) => {
    const { fetchWithAuth } = useApi();
    const [name, setName] = useState('');
    const [charClass, setCharClass] = useState('Warrior');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [startingGear, setStartingGear] = useState<GameItem[]>([]);
    const [selectedGear, setSelectedGear] = useState<Record<string, string>>({});

    const slots: GearSubType[] = ['HEAD', 'SHOULDERS', 'CHEST', 'GAUNTLETS', 'LEGGINGS', 'BOOTS', 'WEAPON'];

    React.useEffect(() => {
        fetchWithAuth('/api/public/items?isStartingPiece=true')
            .then(res => res.json())
            .then((data: GameItem[]) => {
                setStartingGear(data);
            })
            .catch(console.error);
    }, []);

    const classes = ['Warrior', 'Mage', 'Rogue'];

    const gearLayers: GearLayerDescriptor[] = React.useMemo(() => {
        return slots
            .map(slot => {
                const selectedId = selectedGear[slot];
                if (!selectedId) return null;
                const itemDef = startingGear.find(g => g.id === selectedId);
                if (!itemDef || !itemDef.gearImageUrl) return null;
                return {
                    url: `${import.meta.env.VITE_API_URL || ''}${itemDef.gearImageUrl}`,
                    subType: slot,
                };
            })
            .filter((layer): layer is GearLayerDescriptor => layer !== null);
    }, [selectedGear, startingGear]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetchWithAuth('/api/characters', {
                method: 'POST',
                body: JSON.stringify({ name, class: charClass, gearSelections: selectedGear }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create character');

            onCreated(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="create-character-wrapper w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-8 items-start animate-in zoom-in-95 duration-500">
            {/* LEFT SIDE: Forms & Options */}
            <div className="create-character-form flex-1 bg-panel/50 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-3xl">
                <h2 className="text-3xl font-black text-white mb-8 tracking-tight">Establish Your Legacy</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Character Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sol focus:border-transparent transition-all"
                            placeholder="Choose a name..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Select Class</label>
                        <div className="grid grid-cols-3 gap-3">
                            {classes.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCharClass(c)}
                                    className={`py-3 rounded-xl border font-bold transition-all cursor-pointer ${charClass === c
                                            ? 'bg-sol border-sol text-slate-900 shadow-lg shadow-sol/20'
                                             : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                        }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Starting Gear</label>
                        <div className="space-y-4">
                            {slots.map(slot => {
                                const available = startingGear.filter(g => g.subType === slot);
                                if (available.length === 0) return null;
                                return (
                                    <div key={slot} className="flex flex-col p-3 bg-slate-900 border border-white/5 rounded-xl">
                                        <label className="text-xs font-bold text-slate-500 mb-2">{slot}</label>
                                        <select
                                            value={selectedGear[slot] || ''}
                                            onChange={(e) => setSelectedGear({ ...selectedGear, [slot]: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none"
                                        >
                                            <option value="">-- No {slot} --</option>
                                            {available.map(item => (
                                                <option key={item.id} value={item.id}>{item.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex space-x-4 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-4 bg-white/5 text-slate-300 font-bold rounded-xl hover:bg-white/10 transition-all cursor-pointer"
                        >
                            Discard
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-4 bg-sol text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-sol/10"
                        >
                            {loading ? 'Manifesting...' : 'Begin Saga'}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIGHT SIDE: PixiJS Visual Preview */}
            <div className="create-character-preview flex-1 bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 relative shadow-2xl flex flex-col items-center p-8">
                <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-widest absolute top-6 left-6 z-10">Preview</h3>

                <div className="canvas-container bg-slate-800 rounded-2xl p-4 shadow-inner flex items-center justify-center filter drop-shadow-xl border border-white/5 w-full" style={{ height: '530px' }}>
                    <PixiStageProvider className="w-full h-full flex items-center justify-center">
                        <SpriteRenderer
                            type="modular"
                            gearLayers={gearLayers}
                            width={380}
                            height={480}
                        />
                    </PixiStageProvider>
                </div>
            </div>
        </div>
    );
};
