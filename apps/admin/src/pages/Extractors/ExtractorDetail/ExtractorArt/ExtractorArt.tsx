import React, { useRef, useState } from 'react';
import { getAssetUrl, type ExtractorDefinition } from '@mine-me/shared';
import { useApi } from '../../../../hooks/useApi';
import { useToast } from '../../../../contexts/ToastContext';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './ExtractorArt.css';

type Part = 'body' | 'belt';

const PARTS: { part: Part; label: string; hint: string; field: 'textureUrl' | 'beltTextureUrl' }[] = [
  { part: 'body', label: 'Machine', hint: 'The landed extractor, sized to its footprint', field: 'textureUrl' },
  { part: 'belt', label: 'Belt Segment', hint: 'One tileable row, as wide as the shaft', field: 'beltTextureUrl' },
];

interface ExtractorArtProps {
  extractor: Pick<ExtractorDefinition, 'id' | 'textureUrl' | 'beltTextureUrl'>;
  onUploaded: (extractor: ExtractorDefinition) => void;
}

/** The extractor's pictures. Until they are uploaded the game draws plain placeholders. */
export default function ExtractorArt({ extractor, onUploaded }: ExtractorArtProps) {
  const { fetchWithAuth } = useApi();
  const toast = useToast();
  const [uploading, setUploading] = useState<Part | null>(null);
  const inputs = useRef<Record<Part, HTMLInputElement | null>>({ body: null, belt: null });

  const upload = async (part: Part, file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('Only PNG or JPG images are allowed.');
      return;
    }
    setUploading(part);
    try {
      const form = new FormData();
      form.append('texture', file);
      const res = await fetchWithAuth(`/api/admin/extractors/${extractor.id}/texture/${part}`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to upload the picture');
      }
      onUploaded(await res.json());
      toast.success('Picture saved!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(null);
      const input = inputs.current[part];
      if (input) input.value = '';
    }
  };

  return (
    <section className="extractor-art bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="extractor-art">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Art</h4>
        <p className="text-xs text-slate-500 font-medium">Saved as soon as you choose a picture.</p>
      </div>
      {PARTS.map(({ part, label, hint, field }) => {
        const url = extractor[field];
        return (
          <div key={part} className="flex items-center gap-4">
            <div className="w-20 h-20 shrink-0 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1">
              {url ? (
                <img src={getAssetUrl(url)} alt={`${label} art`} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : (
                <span className="text-[10px] font-bold uppercase text-slate-400">Placeholder</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-800 uppercase tracking-wide">{label}</p>
              <p className="text-[11px] text-slate-400 font-medium">{hint}</p>
              <p className="text-[11px] font-mono text-slate-500 truncate">{url?.split('/').pop() ?? 'None'}</p>
            </div>
            <input
              ref={(el) => {
                inputs.current[part] = el;
              }}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              aria-label={`${label} picture`}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => void upload(part, e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => inputs.current[part]?.click()}
              className="cursor-pointer px-4 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-all flex items-center gap-2"
            >
              {uploading === part && <LoadingSpinner size={14} color="inherit" />}
              {url ? 'Replace' : 'Upload'}
            </button>
          </div>
        );
      })}
    </section>
  );
}
