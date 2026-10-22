import React, { useEffect, useRef } from 'react';
import {
  autotileMask,
  drawAutotileVariant,
  getAssetUrl,
  resolveAutotileStyle,
  MiningTileType,
  type AutotileConfig,
  type AutotileStyle,
  type MiningClientTile,
} from '@mine-me/shared';
import './AutotilePanel.css';

interface AutotilePanelProps {
  /** This level's own settings; null means "use the level below". */
  value: AutotileConfig | null | undefined;
  onChange: (value: AutotileConfig | null) => void;
  /** The look this level falls back to for a field it leaves out (the map's, for a block). */
  inherited?: AutotileConfig | null;
  /** The block's picture, for the preview. A plain brown block is drawn when there is none. */
  textureUrl?: string | null;
  title?: string;
  description?: string;
  /** Wording of the switch when this level has no settings of its own. */
  inheritLabel?: string;
}

interface StyleField {
  key: 'radius' | 'rimWidth' | 'rimStrength';
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: StyleField[] = [
  { key: 'radius', label: 'Corner Radius', hint: 'How round the outer corners are, as a fraction of the block (0 is square)', min: 0, max: 0.5, step: 0.01 },
  { key: 'rimWidth', label: 'Rim Width', hint: 'How far the soft edge shadow reaches into the block', min: 0, max: 0.5, step: 0.01 },
  { key: 'rimStrength', label: 'Rim Strength', hint: 'How dark the edge is (0 is none)', min: 0, max: 1, step: 0.05 },
];

/** The sample cave the preview draws: D is a block, . is open space. */
const SAMPLE = ['DDDDDDD', 'DDD.DDD', 'DD...DD', 'D....DD', 'DD..DDD', 'DDDDDDD'];
const PREVIEW_CELL = 44;
const VARIANT_SIZE = 64;

/** Draws the sample cave with `image` as the block's picture and `style` as its edge look. */
export function drawAutotilePreview(canvas: HTMLCanvasElement, image: CanvasImageSource, style: AutotileStyle): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const grid: MiningClientTile[][] = SAMPLE.map((row) =>
    [...row].map((c) => ({ type: c === 'D' ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true }))
  );
  canvas.width = SAMPLE[0].length * PREVIEW_CELL;
  canvas.height = SAMPLE.length * PREVIEW_CELL;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scratch = document.createElement('canvas');
  scratch.width = VARIANT_SIZE;
  scratch.height = VARIANT_SIZE;
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) return;
  grid.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile.type !== MiningTileType.DIRT) return;
      drawAutotileVariant(scratchCtx, image, VARIANT_SIZE, VARIANT_SIZE, autotileMask(grid, x, y), style);
      ctx.drawImage(scratch, x * PREVIEW_CELL, y * PREVIEW_CELL, PREVIEW_CELL, PREVIEW_CELL);
    })
  );
}

/** A plain stand-in picture for a block that has no texture yet. */
function plainBlock(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = VARIANT_SIZE;
  canvas.height = VARIANT_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#7c5a3a';
    ctx.fillRect(0, 0, VARIANT_SIZE, VARIANT_SIZE);
  }
  return canvas;
}

/**
 * The edge look of terrain blocks (ticket 094): corner radius and rim, with a live preview. Used on the Mine
 * Generator page (the default for every block) and on a block (its own look, field by field over the default).
 */
export const AutotilePanel: React.FC<AutotilePanelProps> = ({
  value,
  onChange,
  inherited = null,
  textureUrl = null,
  title = 'Edge Look',
  description = 'How the edges of terrain blocks are drawn where they meet open space',
  inheritLabel = 'Default look',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const custom = value !== null && value !== undefined;
  const style = resolveAutotileStyle(inherited, value);
  const styleKey = JSON.stringify(style);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const draw = (image: CanvasImageSource) => {
      if (!cancelled) drawAutotilePreview(canvas, image, style);
    };
    if (!textureUrl) {
      draw(plainBlock());
      return () => {
        cancelled = true;
      };
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => draw(image);
    image.onerror = () => draw(plainBlock());
    image.src = getAssetUrl(textureUrl);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey, textureUrl]);

  const update = (patch: AutotileConfig) => onChange({ ...value, ...patch });
  const reset = (key: keyof AutotileStyle) => {
    const { [key]: _removed, ...rest } = value ?? {};
    onChange(rest);
  };

  return (
    <div className="autotile-panel bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5" data-testid="autotile-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">{title}</h4>
          <p className="text-xs text-slate-500 font-medium">{description}</p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto bg-white hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl transition-colors">
          <input
            type="checkbox"
            aria-label="Custom look"
            checked={custom}
            onChange={(e) => onChange(e.target.checked ? {} : null)}
            className="w-5 h-5 rounded cursor-pointer accent-slate-800"
          />
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">{custom ? 'Custom look' : inheritLabel}</span>
        </label>
      </div>

      <canvas ref={canvasRef} data-testid="autotile-preview" className="rounded-xl border border-slate-200 w-full max-w-md" />

      {custom && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`autotile-${field.key}`} className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                  {field.label}
                </label>
                {value?.[field.key] !== undefined && (
                  <button
                    type="button"
                    onClick={() => reset(field.key)}
                    className="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
                  >
                    Use default
                  </button>
                )}
              </div>
              <input
                id={`autotile-${field.key}`}
                type="number"
                value={style[field.key]}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => {
                  if (e.target.value !== '') update({ [field.key]: Number(e.target.value) });
                }}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800"
              />
              <span className="text-[11px] text-slate-400 font-medium">{field.hint}</span>
            </div>
          ))}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="autotile-rimColor" className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                Rim Colour
              </label>
              {value?.rimColor !== undefined && (
                <button
                  type="button"
                  onClick={() => reset('rimColor')}
                  className="cursor-pointer text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
                >
                  Use default
                </button>
              )}
            </div>
            <input
              id="autotile-rimColor"
              type="color"
              value={style.rimColor}
              onChange={(e) => update({ rimColor: e.target.value })}
              className="cursor-pointer h-10 w-24 bg-white border border-slate-200 rounded-xl"
            />
            <span className="block text-[11px] text-slate-400 font-medium">The colour of the edge shadow and line</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutotilePanel;
