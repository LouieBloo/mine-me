import React, { useRef, useState } from 'react';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import { uploadSurfaceImage } from '../../surfaceUpload';
import type { SurfaceEnvironmentForm } from '../../surfaceEnvironmentForm';

interface CloudsPanelProps {
  form: Pick<SurfaceEnvironmentForm, 'cloudMax' | 'cloudMinHeight' | 'cloudMaxHeight' | 'cloudTextures'>;
  environmentId?: string;
  onChange: <K extends keyof SurfaceEnvironmentForm>(key: K, value: SurfaceEnvironmentForm[K]) => void;
}

const MAX_PICTURES = 6;

/** The clouds that drift across the sky. The weather decides how many of them show; pictures are optional (soft shapes are drawn without). */
const CloudsPanel: React.FC<CloudsPanelProps> = ({ form, environmentId, onChange }) => {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file || !environmentId) return;
    setBusy(true);
    try {
      const url = await uploadSurfaceImage(fetchWithAuth, environmentId, `cloud_${form.cloudTextures.length + 1}`, file);
      onChange('cloudTextures', [...form.cloudTextures, url]);
      toast.success('Cloud picture saved!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={panelClass} data-testid="clouds-panel">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Clouds</h4>
        <p className="text-xs text-slate-500 font-medium">Clouds drift across the sky at different speeds. Cloudy and stormy weather shows more of them and darker. Pictures should be white on a clear background.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <div className="space-y-1">
          <label htmlFor="cloud-max" className={labelClass}>Most Clouds</label>
          <input id="cloud-max" type="number" min={0} max={24} step={1} value={show(form.cloudMax)} onChange={(e) => onChange('cloudMax', readNumber(e.target.value))} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cloud-min" className={labelClass}>Lowest (blocks)</label>
          <input id="cloud-min" type="number" step={1} value={show(form.cloudMinHeight)} onChange={(e) => onChange('cloudMinHeight', readNumber(e.target.value))} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cloud-high" className={labelClass}>Highest (blocks)</label>
          <input id="cloud-high" type="number" step={1} value={show(form.cloudMaxHeight)} onChange={(e) => onChange('cloudMaxHeight', readNumber(e.target.value))} className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <span className={labelClass}>Cloud Pictures</span>
        {form.cloudTextures.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">None: soft cloud shapes are drawn in code.</p>}
        {form.cloudTextures.map((url, i) => (
          <div key={`${url}-${i}`} className="flex items-center gap-3" data-testid={`cloud-picture-${i}`}>
            <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-600">{url}</span>
            <button type="button" aria-label={`Remove cloud picture ${i + 1}`} onClick={() => onChange('cloudTextures', form.cloudTextures.filter((_, j) => j !== i))} className={dangerButtonClass}>Remove</button>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <input ref={input} type="file" accept="image/png,image/jpeg" aria-label="Upload cloud picture" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" disabled={!environmentId || busy || form.cloudTextures.length >= MAX_PICTURES} title={environmentId ? undefined : 'Save the environment first, then upload pictures'} onClick={() => input.current?.click()} className={buttonClass}>
            {busy ? 'Uploading…' : '+ Add Cloud Picture'}
          </button>
          {busy && <LoadingSpinner size={20} />}
        </div>
        {!environmentId && <span className={hintClass}>Save the environment first, then upload pictures.</span>}
        {form.cloudTextures.length >= MAX_PICTURES && <span className={hintClass}>At most {MAX_PICTURES} pictures.</span>}
      </div>
    </div>
  );
};

export default CloudsPanel;
