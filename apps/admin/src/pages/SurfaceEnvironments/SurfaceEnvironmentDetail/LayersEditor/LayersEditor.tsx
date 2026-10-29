import React, { useRef, useState } from 'react';
import type { SurfaceLayerDef, SurfaceLayerShape } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import { moveItem, newLayer } from '../../surfaceEnvironmentForm';
import { pictureName, uploadSurfaceImage } from '../../surfaceUpload';

interface LayersEditorProps {
  layers: SurfaceLayerDef[];
  /** The saved environment's id: pictures can only be uploaded once it exists. */
  environmentId?: string;
  onChange: (layers: SurfaceLayerDef[]) => void;
}

const SHAPES: Array<{ id: SurfaceLayerShape; label: string }> = [
  { id: 'mountains', label: 'Mountains' },
  { id: 'hills', label: 'Hills' },
  { id: 'treeline', label: 'Treeline' },
  { id: 'flat', label: 'Flat' },
];

const colorInput = 'h-10 w-14 cursor-pointer bg-white border border-slate-200 rounded-lg p-1';

/**
 * The strips of scenery along the horizon, far to near (the first is drawn first, so it is the farthest). A strip with a
 * picture tiles it sideways; a strip without one is drawn as a silhouette in code, so a new environment looks right before any art
 * exists. Parallax is how much of the camera's movement the strip follows: near 1 it hardly moves (far away), near 0 it moves with the ground.
 */
const LayersEditor: React.FC<LayersEditorProps> = ({ layers, environmentId, onChange }) => {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  const update = (index: number, patch: Partial<SurfaceLayerDef>) => onChange(layers.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const upload = async (index: number, file: File | undefined) => {
    if (!file || !environmentId) return;
    setBusy(index);
    try {
      const url = await uploadSurfaceImage(fetchWithAuth, environmentId, layers[index].name, file);
      update(index, { textureUrl: url });
      toast.success(`Picture for ${layers[index].name} saved!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      const input = inputs.current[index];
      if (input) input.value = '';
    }
  };

  return (
    <div className={panelClass} data-testid="layers-editor">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Scenery</h4>
        <p className="text-xs text-slate-500 font-medium">Strips of mountains, hills or trees behind the ground, far to near. Without a picture a strip is drawn as a plain silhouette. Pictures must tile sideways without a seam.</p>
      </div>

      {layers.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">No scenery: the sky meets the ground.</p>}

      {layers.map((layer, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid={`layer-${i}`}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
              Name
              <input aria-label={`Layer ${i + 1} name`} type="text" value={layer.name} onChange={(e) => update(i, { name: e.target.value })} className="w-40 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800" />
            </label>
            <span className={hintClass}>{i === 0 ? 'farthest' : i === layers.length - 1 ? 'nearest' : `layer ${i + 1}`}</span>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" aria-label={`Move layer ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moveItem(layers, i, i - 1))} className={buttonClass}>Farther</button>
              <button type="button" aria-label={`Move layer ${i + 1} down`} disabled={i === layers.length - 1} onClick={() => onChange(moveItem(layers, i, i + 1))} className={buttonClass}>Nearer</button>
              <button type="button" aria-label={`Remove layer ${i + 1}`} onClick={() => onChange(layers.filter((_, j) => j !== i))} className={dangerButtonClass}>Remove</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={(el) => { inputs.current[i] = el; }} type="file" accept="image/png,image/jpeg" aria-label={`Upload layer ${i + 1} picture`} className="hidden" onChange={(e) => upload(i, e.target.files?.[0])} />
            <button type="button" disabled={!environmentId || busy !== null} title={environmentId ? undefined : 'Save the environment first, then upload pictures'} onClick={() => inputs.current[i]?.click()} className={buttonClass}>
              {busy === i ? 'Uploading…' : layer.textureUrl ? 'Replace Picture' : 'Upload Picture'}
            </button>
            {busy === i && <LoadingSpinner size={20} />}
            <input aria-label={`Layer ${i + 1} picture`} type="text" placeholder="/assets/… (empty: drawn silhouette)" value={layer.textureUrl ?? ''} onChange={(e) => update(i, { textureUrl: e.target.value.trim() === '' ? null : e.target.value.trim() })} className={`${inputClass} font-mono flex-1 min-w-[12rem]`} />
            <button type="button" aria-label={`Clear layer ${i + 1} picture`} disabled={!layer.textureUrl} onClick={() => update(i, { textureUrl: null })} className={buttonClass}>Clear</button>
          </div>
          {!environmentId && <span className={hintClass}>Save the environment first, then upload pictures.</span>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className={labelClass} htmlFor={`layer-${i}-parallax`}>Parallax (0-1)</label>
              <input id={`layer-${i}-parallax`} type="number" min={0} max={1} step={0.05} value={show(layer.parallaxFactor)} onChange={(e) => update(i, { parallaxFactor: readNumber(e.target.value) })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor={`layer-${i}-offset`}>Offset (blocks)</label>
              <input id={`layer-${i}-offset`} type="number" step={1} value={show(layer.yOffset)} onChange={(e) => update(i, { yOffset: readNumber(e.target.value) })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor={`layer-${i}-alpha`}>Opacity (0-1)</label>
              <input id={`layer-${i}-alpha`} type="number" min={0} max={1} step={0.05} value={show(layer.alpha ?? 1)} onChange={(e) => update(i, { alpha: readNumber(e.target.value) })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor={`layer-${i}-tint`}>Tint</label>
              <div className="flex items-center gap-2">
                <input id={`layer-${i}-tint`} type="color" value={layer.tint ?? '#ffffff'} onChange={(e) => update(i, { tint: e.target.value })} className={colorInput} />
                <button type="button" aria-label={`Clear layer ${i + 1} tint`} disabled={!layer.tint} onClick={() => update(i, { tint: null })} className={buttonClass}>None</button>
              </div>
            </div>
          </div>

          {layer.textureUrl ? (
            <div className="space-y-1 max-w-[10rem]">
              <label className={labelClass} htmlFor={`layer-${i}-scale`}>Picture scale</label>
              <input id={`layer-${i}-scale`} type="number" min={0.1} max={8} step={0.1} value={show(layer.scale ?? 1)} onChange={(e) => update(i, { scale: readNumber(e.target.value) })} className={inputClass} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="space-y-1">
                <label className={labelClass} htmlFor={`layer-${i}-shape`}>Silhouette</label>
                <select id={`layer-${i}-shape`} value={layer.shape ?? 'hills'} onChange={(e) => update(i, { shape: e.target.value as SurfaceLayerShape })} className={`${inputClass} cursor-pointer`}>
                  {SHAPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass} htmlFor={`layer-${i}-height`}>Height (blocks)</label>
                <input id={`layer-${i}-height`} type="number" min={1} max={200} step={1} value={show(layer.height ?? 30)} onChange={(e) => update(i, { height: readNumber(e.target.value) })} className={inputClass} />
              </div>
            </div>
          )}
          <span className={hintClass}>A picture is saved as {environmentId ? `…/${environmentId}-${pictureName(layer.name)}.png` : 'a file named after the layer'}.</span>
        </div>
      ))}

      <button type="button" onClick={() => onChange([...layers, newLayer(layers)])} className={buttonClass}>
        + Add Layer
      </button>
    </div>
  );
};

export default LayersEditor;
