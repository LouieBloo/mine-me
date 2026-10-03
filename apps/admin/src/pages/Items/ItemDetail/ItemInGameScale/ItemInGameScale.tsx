import React from 'react';
import { getAssetUrl } from '@mine-me/shared';
import './ItemInGameScale.css';

export interface ItemInGameScaleProps {
  value: number;
  onChange: (newValue: number) => void;
  spriteUrl?: string | null;
  itemName?: string;
  error?: string;
}

export const ItemInGameScale: React.FC<ItemInGameScaleProps> = ({
  value,
  onChange,
  spriteUrl,
  itemName = 'Item',
  error,
}) => {
  const currentScale = typeof value === 'number' && !isNaN(value) && value > 0 ? value : 1.0;
  const fullSpriteUrl = spriteUrl ? getAssetUrl(spriteUrl) : null;

  // Standard dropped base size in-game is 32px (0.5 * 64px tile)
  const baseSize = 32;
  const previewPixelSize = Math.round(baseSize * currentScale);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(Math.round(parsed * 100) / 100);
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(Math.max(0.1, Math.min(5.0, Math.round(parsed * 100) / 100)));
    }
  };

  return (
    <div className="item-in-game-scale bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            In-Game World Scale
            <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded-full">
              {currentScale.toFixed(2)}x
            </span>
          </h4>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Scales the size of the item sprite when dropped in the mine (base size is 0.5× of a 64px tile).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentScale !== 1.0 && (
            <button
              type="button"
              onClick={() => onChange(1.0)}
              className="cursor-pointer text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors shadow-sm"
            >
              Reset to 1.0x
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Controls Column */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-slate-600">
              <label htmlFor="in-game-scale-slider" className="cursor-pointer uppercase tracking-wider text-[10px] text-slate-400 font-black">
                Scale Multiplier (0.2x – 3.0x)
              </label>
              <span className="font-mono text-slate-700">{currentScale.toFixed(2)}x</span>
            </div>
            <input
              id="in-game-scale-slider"
              type="range"
              min="0.2"
              max="3.0"
              step="0.05"
              value={currentScale}
              onChange={handleSliderChange}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono">
              <span>0.2x (Tiny)</span>
              <span>1.0x (Default)</span>
              <span>2.0x (Large)</span>
              <span>3.0x (Huge)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <label htmlFor="in-game-scale-input" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Exact Multiplier
              </label>
              <div className="relative">
                <input
                  id="in-game-scale-input"
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="5.0"
                  value={currentScale}
                  onChange={handleNumberChange}
                  className={`w-32 p-2 bg-white border rounded-lg font-bold text-slate-800 text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none ${
                    error ? 'border-red-500 bg-red-50' : 'border-slate-300'
                  }`}
                />
                <span className="absolute right-3 top-2 text-xs font-black text-slate-400 pointer-events-none">
                  ×
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-500 pt-5 space-y-0.5">
              <p className="font-bold">
                Rendered Size: <span className="text-slate-800 font-mono font-black">{previewPixelSize}px × {previewPixelSize}px</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Standard tile is 64px × 64px.
              </p>
            </div>
          </div>
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
        </div>

        {/* Live Grid Preview Column */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-slate-900 rounded-xl border border-slate-800">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Simulated In-Game Tile (64px)
          </div>

          {/* 96px container preview box showing a full 64px dashed tile in center */}
          <div className="grid-preview-box relative w-32 h-32 rounded-lg flex items-center justify-center overflow-hidden border border-slate-700 shadow-inner">
            {/* 64px dashed boundary box representing exactly 1 mining tile */}
            <div className="tile-boundary-box absolute w-16 h-16 flex items-center justify-center pointer-events-none">
              <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-sky-400/60 uppercase select-none">
                1 Tile
              </span>
            </div>

            {/* Dropped item representation */}
            {fullSpriteUrl ? (
              <img
                src={fullSpriteUrl}
                alt={itemName}
                style={{
                  width: `${previewPixelSize}px`,
                  height: `${previewPixelSize}px`,
                  imageRendering: 'pixelated',
                }}
                className="object-contain transition-all duration-75 select-none drop-shadow-md"
              />
            ) : (
              <div
                style={{
                  width: `${previewPixelSize}px`,
                  height: `${previewPixelSize}px`,
                }}
                className="bg-amber-500 border border-amber-300 rounded shadow-md flex items-center justify-center text-[9px] font-black text-amber-950 transition-all duration-75 select-none"
              >
                {itemName.slice(0, 3).toUpperCase()}
              </div>
            )}
          </div>

          <div className="mt-2 text-[10px] font-medium text-slate-400 text-center">
            Item occupies <span className="text-sky-300 font-bold">{Math.round((previewPixelSize / 64) * 100)}%</span> of a mine tile width
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemInGameScale;
