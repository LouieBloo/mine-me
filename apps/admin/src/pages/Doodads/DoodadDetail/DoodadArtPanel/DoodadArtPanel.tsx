import React, { useRef, useState } from 'react';
import { getAssetUrl, type DoodadDefinition, type DoodadPartDef } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show, smallInputClass } from '../panelStyles';
import { readImageSize } from './imageSize';
import './DoodadArtPanel.css';

interface DoodadArtPanelProps {
  /** The saved doodad's id: pictures can only be uploaded once the doodad exists. */
  doodadId?: string;
  textureUrl: string | null;
  parts: DoodadPartDef[];
  onTextureChange: (url: string | null) => void;
  onPartsChange: (parts: DoodadPartDef[]) => void;
}

const PART_NAME = /^[a-z][a-z0-9_]*$/;
const MAX_BYTES = 10 * 1024 * 1024;

const newPart = (existing: DoodadPartDef[]): DoodadPartDef => {
  let n = existing.length + 1;
  while (existing.some((p) => p.name === `part${n}`)) n++;
  return { name: `part${n}`, file: '', width: 32, height: 32, pivot_anchor: [16, 32], offset_from_anchor: [0, 0], z_index: existing.length };
};

/** Checks a picked file; returns the reason it cannot be used, or null. */
const fileProblem = (file: File): string | null => {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return 'Only PNG or JPG images are allowed.';
  if (file.size > MAX_BYTES) return 'Pictures can be at most 10 MB.';
  return null;
};

/**
 * The doodad's art: one main picture, or several parts that move on their own. A part has a pivot (the point it turns about,
 * in its own picture's pixels) and an offset from the doodad's anchor point, like a part of the character rig.
 */
const DoodadArtPanel: React.FC<DoodadArtPanelProps> = ({ doodadId, textureUrl, parts, onTextureChange, onPartsChange }) => {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const textureInput = useRef<HTMLInputElement | null>(null);
  const partInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const updatePart = (index: number, patch: Partial<DoodadPartDef>) => onPartsChange(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const pair = (value: [number, number], axis: 0 | 1, raw: string): [number, number] => (axis === 0 ? [readNumber(raw), value[1]] : [value[0], readNumber(raw)]);

  const uploadTexture = async (file: File | undefined) => {
    if (!file || !doodadId) return;
    const problem = fileProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy('texture');
    try {
      const form = new FormData();
      form.append('texture', file);
      const res = await fetchWithAuth(`/api/admin/doodads/${doodadId}/texture`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to upload the doodad picture');
      }
      const saved: DoodadDefinition = await res.json();
      onTextureChange(saved.textureUrl ?? null);
      toast.success('Picture saved!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      if (textureInput.current) textureInput.current.value = '';
    }
  };

  const uploadPart = async (index: number, file: File | undefined) => {
    const part = parts[index];
    if (!file || !doodadId || !part) return;
    if (!PART_NAME.test(part.name)) {
      toast.error('Name the part with lower case letters, digits and underscores (e.g. cap) before uploading its picture.');
      return;
    }
    const problem = fileProblem(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(`part-${index}`);
    try {
      const form = new FormData();
      form.append('texture', file);
      const res = await fetchWithAuth(`/api/admin/doodads/${doodadId}/images/${part.name}`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to upload the part picture');
      }
      const { url } = (await res.json()) as { url: string };
      const size = await readImageSize(file);
      updatePart(index, size ? { file: url, width: size.width, height: size.height, pivot_anchor: [Math.round(size.width / 2), size.height] } : { file: url });
      toast.success(`Picture for ${part.name} saved!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      const input = partInputs.current[index];
      if (input) input.value = '';
    }
  };

  const saveFirst = 'Save the doodad first, then upload its pictures';

  return (
    <div className={`doodad-art-panel ${panelClass}`}>
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Art</h4>
        <p className="text-xs text-slate-500 font-medium">A single picture, or several parts that can move on their own (a stem that stays planted under a cap that sways). Without a picture the game draws a placeholder shape. Pictures follow the art style guide.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="doodad-texture" className={labelClass}>Main Picture</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1">
            {textureUrl ? (
              <img src={getAssetUrl(textureUrl)} alt="Doodad picture" className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <span className="text-[10px] font-bold uppercase text-slate-400 text-center">Placeholder</span>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <input id="doodad-texture" type="text" placeholder="/assets/…" value={textureUrl ?? ''} onChange={(e) => onTextureChange(e.target.value.trim() === '' ? null : e.target.value.trim())} className={`${inputClass} font-mono`} />
            <div className="flex items-center gap-3">
              <input ref={textureInput} type="file" accept="image/png,image/jpeg" aria-label="Upload doodad picture" className="hidden" onChange={(e) => uploadTexture(e.target.files?.[0])} />
              <button type="button" disabled={!doodadId || busy !== null} title={doodadId ? undefined : saveFirst} onClick={() => textureInput.current?.click()} className={buttonClass}>
                {busy === 'texture' ? 'Uploading…' : 'Upload Picture'}
              </button>
              {busy === 'texture' && <LoadingSpinner size={20} />}
              <button type="button" aria-label="Clear picture" disabled={!textureUrl} onClick={() => onTextureChange(null)} className={buttonClass}>Clear</button>
            </div>
          </div>
        </div>
        {!doodadId && <span className={hintClass}>{saveFirst}.</span>}
      </div>

      <div className="space-y-3">
        <div>
          <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">Parts</h5>
          <p className={hintClass}>
            Optional. With parts, they replace the main picture. Pivot and offset are in pixels of the part's own picture; the offset is where the pivot sits from the doodad's anchor point (the base of a floor doodad, the top of a ceiling one, the wall edge of a wall one, the middle of an air one).
          </p>
        </div>
        {parts.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">No parts: the doodad is its main picture.</p>}
        {parts.map((part, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid={`doodad-part-${i}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                Name
                <input aria-label={`Part ${i + 1} name`} type="text" value={part.name} onChange={(e) => updatePart(i, { name: e.target.value })} className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600 flex-1 min-w-[10rem]">
                Picture
                <input aria-label={`Part ${i + 1} picture`} type="text" placeholder="/assets/…" value={part.file} onChange={(e) => updatePart(i, { file: e.target.value.trim() })} className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </label>
              <input ref={(el) => { partInputs.current[i] = el; }} type="file" accept="image/png,image/jpeg" aria-label={`Upload part ${i + 1} picture`} className="hidden" onChange={(e) => uploadPart(i, e.target.files?.[0])} />
              <button type="button" disabled={!doodadId || busy !== null} title={doodadId ? undefined : saveFirst} onClick={() => partInputs.current[i]?.click()} className={buttonClass}>
                {busy === `part-${i}` ? 'Uploading…' : 'Upload'}
              </button>
              {busy === `part-${i}` && <LoadingSpinner size={20} />}
              <button type="button" aria-label={`Remove part ${i + 1}`} onClick={() => onPartsChange(parts.filter((_, j) => j !== i))} className={dangerButtonClass}>Remove</button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {([
                ['Width', 'width', part.width, (raw: string) => updatePart(i, { width: readNumber(raw) })],
                ['Height', 'height', part.height, (raw: string) => updatePart(i, { height: readNumber(raw) })],
                ['Pivot X', 'pivot x', part.pivot_anchor[0], (raw: string) => updatePart(i, { pivot_anchor: pair(part.pivot_anchor, 0, raw) })],
                ['Pivot Y', 'pivot y', part.pivot_anchor[1], (raw: string) => updatePart(i, { pivot_anchor: pair(part.pivot_anchor, 1, raw) })],
                ['Offset X', 'offset x', part.offset_from_anchor[0], (raw: string) => updatePart(i, { offset_from_anchor: pair(part.offset_from_anchor, 0, raw) })],
                ['Offset Y', 'offset y', part.offset_from_anchor[1], (raw: string) => updatePart(i, { offset_from_anchor: pair(part.offset_from_anchor, 1, raw) })],
                ['Layer', 'layer', part.z_index, (raw: string) => updatePart(i, { z_index: readNumber(raw) })],
              ] as const).map(([label, aria, value, onChange]) => (
                <label key={aria} className="flex items-center gap-1 text-xs font-bold text-slate-600">
                  {label}
                  <input aria-label={`Part ${i + 1} ${aria}`} type="number" step={1} value={show(value)} onChange={(e) => onChange(e.target.value)} className={smallInputClass} />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => onPartsChange([...parts, newPart(parts)])} className={buttonClass}>
          + Add Part
        </button>
      </div>
    </div>
  );
};

export default DoodadArtPanel;
