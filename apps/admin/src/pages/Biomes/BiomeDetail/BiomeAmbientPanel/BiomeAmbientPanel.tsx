import React, { useRef, useState } from 'react';
import { getAssetUrl, type BiomeAmbient } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './BiomeAmbientPanel.css';

interface BiomeAmbientPanelProps {
  /** Null/absent: the biome changes nothing about the look. */
  value: BiomeAmbient | null | undefined;
  onChange: (value: BiomeAmbient | null) => void;
  /** The saved biome's id: the wall picture can only be uploaded once the biome exists. */
  biomeId?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const inputClass = 'w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800';
const labelClass = 'block text-xs font-black uppercase text-slate-600 tracking-wider';
const buttonClass = 'cursor-pointer px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs rounded-lg transition-all';

/** An ambient with nothing set is stored as null, so a biome that changes no look has no stray empty object. */
const tidy = (ambient: BiomeAmbient): BiomeAmbient | null => {
  const entries = Object.entries(ambient).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return entries.length > 0 ? (Object.fromEntries(entries) as BiomeAmbient) : null;
};

/** The look of a biome: the wall tint and its own wall texture. Everything is optional. */
const BiomeAmbientPanel: React.FC<BiomeAmbientPanelProps> = ({ value, onChange, biomeId }) => {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const ambient = value ?? {};
  const update = (patch: Partial<BiomeAmbient>) => onChange(tidy({ ...ambient, ...patch }));

  const upload = async (file: File | undefined) => {
    if (!file || !biomeId) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('Only PNG or JPG images are allowed.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('texture', file);
      const res = await fetchWithAuth(`/api/admin/biomes/${biomeId}/wall-texture`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to upload the wall texture');
      }
      const saved = await res.json();
      update({ wallTextureUrl: saved.ambient?.wallTextureUrl ?? null });
      toast.success('Wall texture saved!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="biome-ambient-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Look</h4>
        <p className="text-xs text-slate-500 font-medium">What the cave around the player looks like here. It blends smoothly from biome to biome as they walk</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1">
          <label htmlFor="ambient-tint" className={labelClass}>Wall Tint</label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              aria-label="Wall tint picker"
              value={ambient.tint && HEX_COLOR.test(ambient.tint) ? ambient.tint : '#ffffff'}
              onChange={(e) => update({ tint: e.target.value })}
              className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <input
              id="ambient-tint"
              type="text"
              placeholder="No tint"
              value={ambient.tint ?? ''}
              onChange={(e) => update({ tint: e.target.value.trim() === '' ? null : e.target.value.trim() })}
              className={`${inputClass} font-mono`}
            />
            <button type="button" aria-label="Clear tint" disabled={!ambient.tint} onClick={() => update({ tint: null })} className={`${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}>
              Clear
            </button>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Multiplies the background wall, so a light colour barely changes it and a dark one dims it</span>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="ambient-wall" className={labelClass}>Wall Texture</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1">
            {ambient.wallTextureUrl ? (
              <img src={getAssetUrl(ambient.wallTextureUrl)} alt="Wall texture" className="w-full h-full object-cover rounded-lg" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <span className="text-[10px] font-bold uppercase text-slate-400">Usual wall</span>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <input
              id="ambient-wall"
              type="text"
              placeholder="/assets/…"
              value={ambient.wallTextureUrl ?? ''}
              onChange={(e) => update({ wallTextureUrl: e.target.value.trim() === '' ? null : e.target.value.trim() })}
              className={`${inputClass} font-mono`}
            />
            <div className="flex items-center gap-3">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg" aria-label="Upload wall texture" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
              <button
                type="button"
                disabled={!biomeId || uploading}
                title={biomeId ? undefined : 'Save the biome first, then upload its wall'}
                onClick={() => fileInput.current?.click()}
                className={`${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {uploading ? 'Uploading…' : 'Upload Image'}
              </button>
              {uploading && <LoadingSpinner />}
              <button type="button" aria-label="Clear wall texture" disabled={!ambient.wallTextureUrl} onClick={() => update({ wallTextureUrl: null })} className={`${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}>
                Clear
              </button>
            </div>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">The background wall inside this biome (it fades in as the player arrives). Blank: the usual wall. Upload needs a saved biome</span>
      </div>
    </div>
  );
};

export default BiomeAmbientPanel;
