import { useCallback, useEffect, useState } from 'react';
import { CHARACTER_SOUND_SLOTS, normalizeCharacterSoundRefs, type CharacterSoundSlotRefs } from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import SoundSlotPicker, { type SoundSlotAction } from '../../../components/SoundSlotPicker/SoundSlotPicker';
import './CharacterSoundEffects.css';

const ENDPOINT = '/api/admin/character-sounds';

/**
 * The player character's sounds (hurt, jump, land, death). One set for every character: each slot
 * uses a sound from the shared sound library, chosen or uploaded through the shared picker.
 */
export default function CharacterSoundEffects() {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [refs, setRefs] = useState<CharacterSoundSlotRefs>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchWithAuth(ENDPOINT);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to load the character sounds');
      }
      const body = await res.json();
      setRefs(normalizeCharacterSoundRefs(body?.soundEffects));
    } catch (err: any) {
      const message = err?.message || 'Failed to load the character sounds';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, toast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildRequest = (action: SoundSlotAction) => {
    const current = refs[action.slotKey as keyof CharacterSoundSlotRefs];
    const body =
      action.kind === 'choose'
        ? { soundId: action.soundId }
        : action.kind === 'volume'
          ? { volume: action.volume }
          : { soundId: current?.soundId ?? null, loop: action.loop };
    return fetchWithAuth(`${ENDPOINT}/${action.slotKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return (
    <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4" data-testid="character-sounds">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <span>🔊</span> Character Sounds
        </h3>
        <p className="text-xs text-slate-500">
          Played for the player character in the mine. Pick a sound from the library or upload a new one; changes apply
          to the next run.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6" data-testid="character-sounds-loading">
          <LoadingSpinner size={32} />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
          <span className="flex-1">{loadError}</span>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1 rounded-md bg-white border border-red-300 font-semibold cursor-pointer hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <SoundSlotPicker
          slots={CHARACTER_SOUND_SLOTS}
          selections={refs}
          buildRequest={buildRequest}
          onChange={(updated) => setRefs(normalizeCharacterSoundRefs(updated?.soundEffects))}
          entityLabel="character"
          uploadCategory="CHARACTER"
          testIdPrefix="character-sound"
        />
      )}
    </section>
  );
}
