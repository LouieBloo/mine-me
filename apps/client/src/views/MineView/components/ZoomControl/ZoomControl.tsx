import React from 'react';
import './ZoomControl.css';

export interface ZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
}

const PRESETS = [1.0, 1.25, 1.5, 1.75, 2.0];

export const ZoomControl: React.FC<ZoomControlProps> = ({
  zoom,
  onZoomChange,
  minZoom = 1.0,
  maxZoom = 2.0,
  step = 0.05,
}) => {
  const handleStep = (delta: number) => {
    const next = Math.min(maxZoom, Math.max(minZoom, Math.round((zoom + delta) * 100) / 100));
    onZoomChange(next);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onZoomChange(val);
  };

  const formattedPct = `${Math.round(zoom * 100)}%`;

  return (
    <div
      data-testid="zoom-control"
      className="zoom-control-container pointer-events-auto bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 min-w-[230px]"
    >
      {/* Header with Title and Current Readout */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
          <span>🔍</span> Camera Zoom
        </span>
        <span className="text-xs font-mono font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
          {formattedPct}
        </span>
      </div>

      {/* Slider Row with - / + step buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="zoom-out-button"
          onClick={() => handleStep(-step)}
          disabled={zoom <= minZoom}
          className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-white rounded-lg border border-slate-700 text-sm font-bold cursor-pointer transition-all active:scale-95"
          title="Zoom Out"
        >
          −
        </button>

        <input
          type="range"
          data-testid="zoom-slider-input"
          min={minZoom}
          max={maxZoom}
          step={step}
          value={zoom}
          onChange={handleSliderChange}
          className="zoom-slider-input flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        />

        <button
          type="button"
          data-testid="zoom-in-button"
          onClick={() => handleStep(step)}
          disabled={zoom >= maxZoom}
          className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:text-white rounded-lg border border-slate-700 text-sm font-bold cursor-pointer transition-all active:scale-95"
          title="Zoom In"
        >
          +
        </button>
      </div>

      {/* Presets Row */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800">
        {PRESETS.map((preset) => {
          const isSelected = Math.abs(zoom - preset) < 0.03;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onZoomChange(preset)}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-all ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 font-black shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              {preset}x
            </button>
          );
        })}
      </div>
    </div>
  );
};
