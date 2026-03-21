import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { type Character } from '../CharacterSelection';
import './CreateCharacter.css';

interface Props {
    onCreated: (char: Character) => void;
    onCancel: () => void;
}

export const CreateCharacter: React.FC<Props> = ({ onCreated, onCancel }) => {
    const { token } = useAuth();
    const [name, setName] = useState('');
    const [charClass, setCharClass] = useState('Warrior');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const classes = ['Warrior', 'Mage', 'Rogue'];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/characters`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ name, class: charClass }),
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
        <div className="create-character-form w-full max-w-md bg-panel/50 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-3xl animate-in slide-in-from-bottom-8 duration-500">
            <h2 className="text-3xl font-black text-white mb-8 tracking-tight">Establish Your Legacy</h2>
            
            <form onSubmit={handleSubmit} className="space-y-8">
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
                                className={`py-4 rounded-xl border font-bold transition-all cursor-pointer ${
                                    charClass === c 
                                    ? 'bg-sol border-sol text-slate-900 shadow-lg shadow-sol/20' 
                                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                }`}
                            >
                                {c}
                            </button>
                        ))}
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
    );
};
