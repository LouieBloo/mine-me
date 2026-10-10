import { useEffect, useRef, useState } from 'react';
import {
  getAssetUrl,
  MOB_SOUND_SLOTS,
  normalizeMobSoundRefs,
  type MobSoundSlot,
  type MobSoundSlotRefs,
  type SoundTrack,
} from '@mine-me/shared';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import LoadingSpinner from '../../../components/LoadingSpinner/LoadingSpinner';
import './MobSoundEffects.css';

interface MobSoundEffectsProps {
  /** Null while the mob is unsaved: sounds attach to a saved mob. */
  mobId: string | null;
  soundEffects?: MobSoundSlotRefs | null;
  /** Called with the saved mob after a slot changes. */
  onChange: (updatedMob: any) => void;
}

const CATEGORY_LABEL: Record<string, string> = { MOB: 'Mob sounds', ITEM: 'Item sounds', BLOCK: 'Block sounds', GENERAL: 'General' };

export default function MobSoundEffects({ mobId, soundEffects, onChange }: MobSoundEffectsProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [library, setLibrary] = useState<SoundTrack[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [busySlot, setBusySlot] = useState<MobSoundSlot | null>(null);
  const fileInputs = useRef<Partial<Record<MobSoundSlot, HTMLInputElement | null>>>({});

  const refs = normalizeMobSoundRefs(soundEffects);

  const loadLibrary = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/sounds');
      if (!res.ok) throw new Error('Failed to load the sound library');
      const sounds = await res.json();
      setLibrary(Array.isArray(sounds) ? sounds : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load the sound library');
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    if (mobId) loadLibrary();
  }, [mobId]);

  const send = async (slot: MobSoundSlot, request: () => Promise<Response>, success: string) => {
    setBusySlot(slot);
    try {
      const res = await request();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to update the mob sound');
      }
      onChange(await res.json());
      toast.success(success);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update the mob sound');
    } finally {
      setBusySlot(null);
    }
  };

  const choose = (slot: MobSoundSlot, soundId: string) =>
    send(
      slot,
      () =>
        fetchWithAuth(`/api/admin/mobs/${mobId}/sound-effects/${slot}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ soundId: soundId || null }),
        }),
      soundId ? 'Sound assigned' : 'Sound cleared'
    );

  const upload = async (slot: MobSoundSlot, file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append('soundEffect', file);
    await send(
      slot,
      () => fetchWithAuth(`/api/admin/mobs/${mobId}/sound-effects/${slot}`, { method: 'POST', body: form }),
      'Sound uploaded'
    );
    loadLibrary(); // the new file is now a library sound
    const input = fileInputs.current[slot];
    if (input) input.value = '';
  };

  if (!mobId) {
    return (
      <p className="text-sm font-medium text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4">
        Save the mob first, then you can choose its sounds.
      </p>
    );
  }

  const groups = Object.keys(CATEGORY_LABEL)
    .map((category) => ({
      category,
      sounds: library.filter((s) => (s.category ?? 'GENERAL') === category && s.isActive),
    }))
    .filter((g) => g.sounds.length > 0);

  return (
    <div className="mob-sound-effects space-y-4" data-testid="mob-sound-effects">
      {loadingLibrary && <LoadingSpinner size={24} />}
      {MOB_SOUND_SLOTS.map((def) => {
        const selectedId = refs[def.slotKey]?.soundId ?? '';
        const selected = library.find((s) => s.id === selectedId);
        const isBusy = busySlot === def.slotKey;
        const missing = Boolean(selectedId) && !loadingLibrary && !selected;
        return (
          <div key={def.slotKey} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3" data-testid={`mob-sound-slot-${def.slotKey}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-black text-slate-800 text-sm">
                  <span className="mr-2">{def.icon}</span>
                  {def.label}
                </div>
                <div className="text-xs text-slate-500">{def.description}</div>
              </div>
              {isBusy && <LoadingSpinner size={22} />}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label={`${def.label} sound`}
                value={selectedId}
                disabled={isBusy}
                onChange={(e) => choose(def.slotKey, e.target.value)}
                className="cursor-pointer min-w-60 p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">None (silent)</option>
                {missing && <option value={selectedId}>Missing sound ({selectedId})</option>}
                {groups.map((g) => (
                  <optgroup key={g.category} label={CATEGORY_LABEL[g.category]}>
                    {g.sounds.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <input
                ref={(el) => {
                  fileInputs.current[def.slotKey] = el;
                }}
                type="file"
                accept="audio/*"
                aria-label={`Upload ${def.label} sound`}
                className="hidden"
                onChange={(e) => upload(def.slotKey, e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => fileInputs.current[def.slotKey]?.click()}
                className="cursor-pointer px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload new
              </button>
              {selectedId && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => choose(def.slotKey, '')}
                  className="cursor-pointer px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              )}
            </div>

            {missing && (
              <p className="text-xs font-bold text-red-600">This slot points at a sound that no longer exists. The mob plays nothing for it.</p>
            )}
            {selected && (
              <audio controls preload="none" src={getAssetUrl(selected.url)} data-testid={`mob-sound-preview-${def.slotKey}`}>
                Your browser does not support the audio element.
              </audio>
            )}
          </div>
        );
      })}
    </div>
  );
}
