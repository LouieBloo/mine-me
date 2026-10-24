import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_BIOME_BLEND_WIDTH, type BiomeDefinition } from '@mine-me/shared';
import { useApi } from '../../hooks/useApi';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import { biomeColor, biomeShares, drawBiomePreview, type BiomePreviewResult, type PreviewMode } from './previewColors';
import './BiomePreview.css';

interface BiomePreviewProps {
  /** The biomes to generate with: the saved ones, with the one being edited in its unsaved state. */
  biomes: Partial<BiomeDefinition>[];
  /** The blend the mine uses (from the map config); the preview can try others. */
  blendWidth?: number;
}

/** Cell size on screen, and how long edits settle before a new strip is asked for. */
const CELL_PIXELS = 5;
const SETTLE_MS = 500;
const STRIP_WIDTH = 135;
const STRIP_HEIGHT = 80;

/**
 * A live strip of mine made with the biomes as they are right now (saved or not): the server generates it, so what
 * shows is what the generator would make. Switch between the blocks it made and the bare regions; change the seed to
 * see another roll; try a different blend width without touching the map config.
 */
const BiomePreview: React.FC<BiomePreviewProps> = ({ biomes, blendWidth = DEFAULT_BIOME_BLEND_WIDTH }) => {
  const { fetchWithAuth } = useApi();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [seed, setSeed] = useState(1);
  const [blend, setBlend] = useState(blendWidth);
  const [mode, setMode] = useState<PreviewMode>('blocks');
  const [result, setResult] = useState<BiomePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A blend width that arrives after the page loads (the map config fetch) becomes the starting point
  useEffect(() => setBlend(blendWidth), [blendWidth]);

  const requestKey = JSON.stringify([biomes, seed, blend]);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchWithAuth('/api/admin/biomes/preview', {
        method: 'POST',
        body: JSON.stringify({ biomes, seed, blendWidth: blend, width: STRIP_WIDTH, height: STRIP_HEIGHT }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || 'Could not generate the preview');
          if (!cancelled) {
            setResult(body as BiomePreviewResult);
            setError(null);
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requestKey]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && result) drawBiomePreview(ctx, result, mode, CELL_PIXELS);
  }, [result, mode]);

  const shares = result ? biomeShares(result) : [];
  const modeButton = (value: PreviewMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={`cursor-pointer px-3 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
        mode === value ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="biome-preview bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 p-4 flex items-center justify-between">
        <h3 className="text-sm font-black text-white tracking-tight uppercase">Preview</h3>
        {loading && <LoadingSpinner size={18} color="inherit" />}
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {modeButton('blocks', 'Blocks')}
          {modeButton('biomes', 'Regions')}
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="cursor-pointer ml-auto px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all"
          >
            New Seed ({seed})
          </button>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900">
          {result ? (
            <canvas
              ref={canvasRef}
              width={result.width * CELL_PIXELS}
              height={result.height * CELL_PIXELS}
              aria-label="Biome preview"
              className="block"
            />
          ) : (
            <div className="flex justify-center items-center py-16" style={{ width: STRIP_WIDTH * CELL_PIXELS, maxWidth: '100%' }}>
              <LoadingSpinner size={32} />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="preview-blend" className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-600">
            <span>Border Softness</span>
            <span className="text-slate-800">{blend.toFixed(2)}</span>
          </label>
          <input
            id="preview-blend"
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={blend}
            onChange={(e) => setBlend(Number(e.target.value))}
            className="w-full cursor-pointer"
          />
          <p className="text-[11px] text-slate-400 font-medium">Only for this preview. The mine uses the value on the Mine Generator page ({blendWidth.toFixed(2)}).</p>
        </div>

        {shares.length > 0 && (
          <ul className="space-y-1" aria-label="Biome shares">
            {shares.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <span className="inline-block w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: biomeColor(i, result?.biomes[i]?.ambient) }} />
                <span className="flex-1 truncate">{s.name}</span>
                <span>{Math.round(s.share * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BiomePreview;
