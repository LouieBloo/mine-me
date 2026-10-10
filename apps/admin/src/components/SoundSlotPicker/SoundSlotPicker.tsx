import { useRef, useState } from 'react';
import { getAssetUrl, type SoundCategory } from '@mine-me/shared';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useSoundLibrary } from '../../hooks/useSoundLibrary';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import './SoundSlotPicker.css';

/** A sound slot an entity (mob, item, ...) can fill. Mob and item slot definitions both fit this. */
export interface SoundSlotDefinition {
  slotKey: string;
  label: string;
  description: string;
  icon: string;
  loopToggleable?: boolean;
  defaultLoop?: boolean;
}

/** What a slot currently holds. Mobs store a library id; items store the file url (matched to the library). */
export interface SoundSlotSelection {
  soundId?: string | null;
  url?: string | null;
  loop?: boolean;
}

export type SoundSlotAction =
  | { kind: 'choose'; slotKey: string; soundId: string | null }
  | { kind: 'loop'; slotKey: string; loop: boolean };

interface SoundSlotPickerProps {
  slots: readonly SoundSlotDefinition[];
  selections: Record<string, SoundSlotSelection | undefined>;
  /**
   * Sends the change to the server for the entity; the response is the saved entity. (Uploading is
   * not the entity's business: the picker uploads to the sound library and then "chooses" the new sound.)
   */
  buildRequest: (action: SoundSlotAction) => Promise<Response>;
  /** Called with the saved entity after a change. */
  onChange: (updated: any) => void;
  /** Used in messages, e.g. "mob" -> "Failed to update the mob sound". */
  entityLabel: string;
  /** The library category a sound uploaded here is filed under (a filter label only). */
  uploadCategory: SoundCategory;
  /** Prefix for test ids: `${prefix}-effects`, `${prefix}-slot-<key>`, `${prefix}-preview-<key>`. */
  testIdPrefix: string;
}

const CATEGORY_LABEL: Record<string, string> = { MOB: 'Mob sounds', ITEM: 'Item sounds', BLOCK: 'Block sounds', GENERAL: 'General' };
const UNLISTED = '__unlisted__';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * One row per sound slot: pick a sound already in the library, upload a new one (it joins the
 * library and the slot uses it), preview it, or clear the slot. Shared by every admin screen that
 * assigns sounds, so they all behave the same.
 */
export default function SoundSlotPicker({
  slots,
  selections,
  buildRequest,
  onChange,
  entityLabel,
  uploadCategory,
  testIdPrefix,
}: SoundSlotPickerProps) {
  const toast = useToast();
  const { fetchWithAuth } = useApi();
  const { library, loading: loadingLibrary, reload: reloadLibrary } = useSoundLibrary(true);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const send = async (slotKey: string, action: SoundSlotAction, success: string) => {
    setBusySlot(slotKey);
    try {
      await sendAction(action, success);
      return true;
    } catch (err: any) {
      toast.error(err.message || `Failed to update the ${entityLabel} sound`);
      return false;
    } finally {
      setBusySlot(null);
    }
  };

  /** Applies one change to the entity; throws with the server's message on failure. */
  const sendAction = async (action: SoundSlotAction, success: string) => {
    const res = await buildRequest(action);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Failed to update the ${entityLabel} sound`);
    }
    onChange(await res.json());
    toast.success(success);
  };

  const choose = (slotKey: string, soundId: string | null) =>
    send(slotKey, { kind: 'choose', slotKey, soundId }, soundId ? 'Sound assigned' : 'Sound cleared');

  /**
   * The one upload path: the file goes to the sound library (keeping its own name), then the slot
   * is pointed at the new library sound.
   */
  const upload = async (slotKey: string, file: File | undefined) => {
    const input = fileInputs.current[slotKey];
    if (!file) return;
    const looksAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!looksAudio) {
      toast.error(`Only audio files (${AUDIO_EXTENSIONS.join(', ')}) are allowed.`);
    } else if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Audio file must be less than 20MB.');
    } else {
      setBusySlot(slotKey);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('type', 'SFX');
        form.append('category', uploadCategory);
        form.append('loop', 'false');
        const res = await fetchWithAuth('/api/admin/sounds', { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Failed to upload the sound');
        }
        const created = await res.json();
        reloadLibrary(); // the new file is now a library sound anyone can pick
        await sendAction({ kind: 'choose', slotKey, soundId: created.id }, 'Sound uploaded');
      } catch (err: any) {
        toast.error(err.message || 'Failed to upload the sound');
      } finally {
        setBusySlot(null);
      }
    }
    if (input) input.value = '';
  };

  const groups = Object.keys(CATEGORY_LABEL)
    .map((category) => ({
      category,
      sounds: library.filter((s) => (s.category ?? 'GENERAL') === category && s.isActive),
    }))
    .filter((g) => g.sounds.length > 0);

  return (
    <div className="sound-slot-picker space-y-4" data-testid={`${testIdPrefix}-effects`}>
      {loadingLibrary && <LoadingSpinner size={24} />}
      {slots.map((def) => {
        const selection = selections[def.slotKey];
        const byUrl = selection?.url ? library.find((s) => s.url === selection.url) : undefined;
        const selectedId = selection?.soundId ?? byUrl?.id ?? '';
        const selected = library.find((s) => s.id === selectedId);
        const missing = Boolean(selection?.soundId) && !loadingLibrary && !selected;
        // An item can point at a file that was never registered in the library (Sync fixes that)
        const unlisted = !selection?.soundId && Boolean(selection?.url) && !loadingLibrary && !byUrl;
        const previewUrl = selected?.url ?? (unlisted ? selection?.url ?? null : null);
        const isBusy = busySlot === def.slotKey;
        const isLooping = selection?.loop ?? def.defaultLoop ?? false;

        return (
          <div
            key={def.slotKey}
            className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
            data-testid={`${testIdPrefix}-slot-${def.slotKey}`}
          >
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
                value={unlisted ? UNLISTED : selectedId}
                disabled={isBusy}
                onChange={(e) => {
                  if (e.target.value !== UNLISTED) choose(def.slotKey, e.target.value || null);
                }}
                className="cursor-pointer min-w-60 p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">None (silent)</option>
                {missing && <option value={selectedId}>Missing sound ({selectedId})</option>}
                {unlisted && <option value={UNLISTED}>Not in library ({selection?.url?.split('/').pop()})</option>}
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
                accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a,.aac,.flac"
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
              {(selectedId || unlisted) && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => choose(def.slotKey, null)}
                  className="cursor-pointer px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 text-xs font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              )}
              {def.loopToggleable && (selectedId || unlisted) && (
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={isLooping}
                    disabled={isBusy}
                    onChange={() => send(def.slotKey, { kind: 'loop', slotKey: def.slotKey, loop: !isLooping }, `Looping ${!isLooping ? 'on' : 'off'}`)}
                    className="w-4 h-4 rounded cursor-pointer"
                  />
                  <span>Looping sound</span>
                </label>
              )}
            </div>

            {missing && (
              <p className="text-xs font-bold text-red-600">
                This slot points at a sound that no longer exists. The {entityLabel} plays nothing for it.
              </p>
            )}
            {unlisted && (
              <p className="text-xs font-bold text-amber-700">
                This file is not in the sound library yet. Use "Sync from disk" on the Music &amp; Sounds page to add it.
              </p>
            )}
            {previewUrl && (
              <audio controls preload="none" src={getAssetUrl(previewUrl)} data-testid={`${testIdPrefix}-preview-${def.slotKey}`}>
                Your browser does not support the audio element.
              </audio>
            )}
          </div>
        );
      })}
    </div>
  );
}
