import { useRef, useEffect, useCallback } from 'react';
import { MiningTileType, type MiningMapConfigData } from '@mine-me/shared';
import LoadingSpinner from '../../../../components/LoadingSpinner/LoadingSpinner';
import './MiningConfigPreview.css';

interface PreviewStats {
  width: number;
  height: number;
  totalTiles: number;
  emptyCount: number;
  solidCount: number;
  mineralCount: number;
  rockCount: number;
  chestCount: number;
  copperiumCount?: number;
  silveriumCount?: number;
  voidPercentage: number;
  solidPercentage: number;
}

export interface PreviewResponse {
  seed: number;
  stats: PreviewStats;
  tiles: number[][];
}

interface MiningConfigPreviewProps {
  config: MiningMapConfigData;
  seed: number;
  onSeedChange: (seed: number) => void;
  previewData: PreviewResponse | null;
  previewing: boolean;
  onRefreshPreview: () => void;
  onRandomizeSeed: () => void;
}

/**
 * Live mini-map preview panel with canvas rendering, seed controller, legend, and summary metrics.
 */
export default function MiningConfigPreview({
  seed,
  onSeedChange,
  previewData,
  previewing,
  onRefreshPreview,
  onRandomizeSeed,
}: MiningConfigPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawCanvas = useCallback((tiles: number[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = tiles.length;
    const cols = tiles[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return;

    const tileSize = canvas.width / cols;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const type = tiles[y][x];
        let color = '#78350f'; // DIRT
        if (y === 0 && x === 22) {
          color = '#10b981'; // ENTRANCE (emerald)
        } else if (type === MiningTileType.EMPTY) {
          color = '#090d16'; // EMPTY / Void
        } else if (type === MiningTileType.DIRT) {
          color = '#78350f'; // DIRT
        } else if (type === MiningTileType.ROCK) {
          color = '#64748b'; // ROCK
        } else if (type === MiningTileType.MINERAL) {
          color = '#f59e0b'; // MINERAL
        } else if (type === MiningTileType.CHEST) {
          color = '#eab308'; // CHEST
        } else if (type === MiningTileType.COPPERIUM) {
          color = '#b45309'; // COPPERIUM (burnished copper)
        } else if (type === MiningTileType.SILVERIUM) {
          color = '#38bdf8'; // SILVERIUM (electric cyan/silver)
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }, []);

  useEffect(() => {
    if (previewData?.tiles) {
      drawCanvas(previewData.tiles);
    }
  }, [previewData, drawCanvas]);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>🗺️</span> Live Mini-Map Preview
          </h3>
          <p className="text-xs text-slate-500">45×45 grid generated from active parameters</p>
        </div>
        <button
          type="button"
          onClick={onRefreshPreview}
          disabled={previewing}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
        >
          {previewing && <LoadingSpinner size={12} color="inherit" />}
          {previewing ? 'Rendering...' : 'Update Preview'}
        </button>
      </div>

      {/* Seed Controller */}
      <div className="flex items-center gap-2">
        <label htmlFor="seedInput" className="text-xs font-bold uppercase text-slate-500">
          Seed:
        </label>
        <input
          id="seedInput"
          type="number"
          value={seed}
          onChange={e => onSeedChange(Number(e.target.value))}
          className="flex-1 px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onRandomizeSeed}
          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          title="Randomize Seed"
        >
          🎲 Random
        </button>
      </div>

      {/* Canvas Container */}
      <div className="relative aspect-square w-full max-w-[420px] mx-auto bg-slate-950 rounded-lg overflow-hidden border-2 border-slate-800 shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={450}
          height={450}
          className="w-full h-full mining-config-canvas"
        />
        {previewing && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
            <LoadingSpinner size={48} />
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#10b981] inline-block"></span>
          <span>Entrance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#090d16] border border-slate-700 inline-block"></span>
          <span>Void / Caves</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#78350f] inline-block"></span>
          <span>Dirt</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#64748b] inline-block"></span>
          <span>Rocks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#eab308] inline-block"></span>
          <span>Chests</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#b45309] inline-block"></span>
          <span>Copperium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#38bdf8] inline-block"></span>
          <span>Silverium</span>
        </div>
      </div>

      {/* Summary Metrics */}
      {previewData?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-blue-600">{previewData.stats.voidPercentage}%</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Cave Openings</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-amber-700">{previewData.stats.solidPercentage}%</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Solid Strata</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-slate-600">{previewData.stats.rockCount}</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Rocks</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-yellow-500">{previewData.stats.chestCount}</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Chests</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-amber-600">{previewData.stats.copperiumCount ?? 0}</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Copperium</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-sky-500">{previewData.stats.silveriumCount ?? 0}</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Silverium</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
            <div className="text-xl font-black text-slate-800">{previewData.stats.totalTiles}</div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Total Tiles</div>
          </div>
        </div>
      )}
    </div>
  );
}
