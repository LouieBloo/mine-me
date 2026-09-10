import { useEffect, useState, useRef, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/LoadingSpinner/LoadingSpinner';
import { useApi } from '../../hooks/useApi';
import { DEFAULT_MINING_MAP_CONFIG, type MiningMapConfigData } from '@mine-me/shared';
import './MiningConfig.css';

interface PreviewStats {
  width: number;
  height: number;
  totalTiles: number;
  emptyCount: number;
  solidCount: number;
  mineralCount: number;
  rockCount: number;
  chestCount: number;
  voidPercentage: number;
  solidPercentage: number;
}

interface PreviewResponse {
  seed: number;
  stats: PreviewStats;
  tiles: number[][];
}

const PRESETS: Record<string, Partial<MiningMapConfigData>> = {
  'Default Balanced': {
    cavernDensity: 42,
    cavernIterations: 3,
    cavernMinDepth: 4,
    tunnelCount: 5,
    tunnelMinLength: 15,
    tunnelMaxLength: 30,
    tunnelWidth: 1,
    tunnelMinDepth: 2,
    rockPercentage: 12,
    mineralPercentage: 10,
    chestCount: 4,
  },
  'Sprawling Caverns': {
    cavernDensity: 65,
    cavernIterations: 4,
    cavernMinDepth: 3,
    tunnelCount: 6,
    tunnelMinLength: 20,
    tunnelMaxLength: 40,
    tunnelWidth: 2,
    tunnelMinDepth: 2,
    rockPercentage: 10,
    mineralPercentage: 12,
    chestCount: 6,
  },
  'Winding Labyrinth': {
    cavernDensity: 20,
    cavernIterations: 3,
    cavernMinDepth: 6,
    tunnelCount: 12,
    tunnelMinLength: 25,
    tunnelMaxLength: 45,
    tunnelWidth: 1,
    tunnelMinDepth: 2,
    rockPercentage: 14,
    mineralPercentage: 10,
    chestCount: 5,
  },
  'Solid Deep Core': {
    cavernDensity: 15,
    cavernIterations: 2,
    cavernMinDepth: 10,
    tunnelCount: 3,
    tunnelMinLength: 10,
    tunnelMaxLength: 20,
    tunnelWidth: 1,
    tunnelMinDepth: 5,
    rockPercentage: 18,
    mineralPercentage: 14,
    chestCount: 4,
  },
};

export default function MiningConfig() {
  const [config, setConfig] = useState<MiningMapConfigData>(DEFAULT_MINING_MAP_CONFIG);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toast = useToast();
  const { fetchWithAuth } = useApi();

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
        } else if (type === 0) {
          color = '#090d16'; // EMPTY / Void
        } else if (type === 1) {
          color = '#78350f'; // DIRT
        } else if (type === 2) {
          color = '#64748b'; // ROCK
        } else if (type === 3) {
          color = '#f59e0b'; // MINERAL
        } else if (type === 4) {
          color = '#eab308'; // CHEST
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }
  }, []);

  const fetchPreview = useCallback(async (targetConfig: MiningMapConfigData, targetSeed: number) => {
    setPreviewing(true);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config/preview', {
        method: 'POST',
        body: JSON.stringify({
          seed: targetSeed,
          config: targetConfig,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate preview');
      }
      const data: PreviewResponse = await res.json();
      setPreviewData(data);
      drawCanvas(data.tiles);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPreviewing(false);
    }
  }, [fetchWithAuth, toast, drawCanvas]);

  useEffect(() => {
    fetchWithAuth('/api/admin/mining-config')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch mining configuration');
        return res.json();
      })
      .then((data: MiningMapConfigData) => {
        setConfig(data);
        setError(null);
        setLoading(false);
        fetchPreview(data, seed);
      })
      .catch(err => {
        setError(err.message);
        toast.error(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (previewData?.tiles) {
      drawCanvas(previewData.tiles);
    }
  }, [previewData, drawCanvas]);

  const handleFieldChange = <K extends keyof MiningMapConfigData>(field: K, value: MiningMapConfigData[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (!preset) return;
    const updated = { ...config, ...preset };
    setConfig(updated);
    fetchPreview(updated, seed);
    toast.success(`Applied preset: ${presetName}`);
  };

  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 2147483647);
    setSeed(newSeed);
    fetchPreview(config, newSeed);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save configuration');
      }
      const updated = await res.json();
      setConfig(updated);
      toast.success('Mining map configuration saved successfully!');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all map generator settings back to balanced defaults?')) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/mining-config/reset', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset configuration');
      }
      const reset = await res.json();
      setConfig(reset);
      fetchPreview(reset, seed);
      toast.success('Reset mining map configuration to default!');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <LoadingSpinner size={64} />
      </div>
    );
  }

  return (
    <div className="mining-config-page space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">MINE GENERATOR CONFIG</h2>
          <p className="text-slate-500 font-medium">
            Fine-tune procedural caves, subterranean caverns, winding tunnels, and resource distribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || saving}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || resetting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <LoadingSpinner size={16} color="inherit" />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Presets Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Presets:</span>
        {Object.keys(PRESETS).map(name => (
          <button
            key={name}
            type="button"
            onClick={() => handleApplyPreset(name)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            {name}
          </button>
        ))}
      </div>

      {/* Main Grid: Controls Left, Live Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Cavern Generation Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>🕳️</span> Cavern Generation (Cellular Automata)
              </h3>
              <p className="text-xs text-slate-500">
                Sculpts organic open chambers and subterranean hollows using depth-scaled cellular automata.
              </p>
            </div>

            {/* Cavern Density Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold text-slate-700">
                <label htmlFor="cavernDensity">Cavern Density (Open Space Ratio)</label>
                <span className="text-blue-600 font-bold">{config.cavernDensity}%</span>
              </div>
              <input
                id="cavernDensity"
                type="range"
                min="0"
                max="90"
                value={config.cavernDensity}
                onChange={e => handleFieldChange('cavernDensity', Number(e.target.value))}
                className="w-full custom-slider cursor-pointer"
              />
              <p className="text-xs text-slate-400">
                Higher density creates expansive, sweeping hollows. Lower density leaves thick, dense rock.
              </p>
            </div>

            {/* Cavern Smoothing Iterations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="cavernIterations" className="text-sm font-semibold text-slate-700">
                  Smoothing Passes
                </label>
                <input
                  id="cavernIterations"
                  type="number"
                  min="1"
                  max="6"
                  value={config.cavernIterations}
                  onChange={e => handleFieldChange('cavernIterations', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">Iterations of the 4-5 neighbor rule (3-4 is optimal).</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="cavernMinDepth" className="text-sm font-semibold text-slate-700">
                  Cavern Start Depth (Tiles)
                </label>
                <input
                  id="cavernMinDepth"
                  type="number"
                  min="1"
                  max="15"
                  value={config.cavernMinDepth}
                  onChange={e => handleFieldChange('cavernMinDepth', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">Depth where caverns begin forming (protects surface).</p>
              </div>
            </div>
          </div>

          {/* Tunnel Generation Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>⛏️</span> Tunnel Generation (Random-Walk Worms)
              </h3>
              <p className="text-xs text-slate-500">
                Carves winding mine shafts connecting isolated caverns and creating exploratory corridors.
              </p>
            </div>

            {/* Tunnel Count Slider */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold text-slate-700">
                <label htmlFor="tunnelCount">Tunnel Count</label>
                <span className="text-blue-600 font-bold">{config.tunnelCount} Worms</span>
              </div>
              <input
                id="tunnelCount"
                type="range"
                min="0"
                max="20"
                value={config.tunnelCount}
                onChange={e => handleFieldChange('tunnelCount', Number(e.target.value))}
                className="w-full custom-slider cursor-pointer"
              />
              <p className="text-xs text-slate-400">Number of random-walk diggers carving across the strata.</p>
            </div>

            {/* Min and Max Length */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="tunnelMinLength" className="text-sm font-semibold text-slate-700">
                  Min Tunnel Length (Steps)
                </label>
                <input
                  id="tunnelMinLength"
                  type="number"
                  min="5"
                  max="60"
                  value={config.tunnelMinLength}
                  onChange={e => handleFieldChange('tunnelMinLength', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="tunnelMaxLength" className="text-sm font-semibold text-slate-700">
                  Max Tunnel Length (Steps)
                </label>
                <input
                  id="tunnelMaxLength"
                  type="number"
                  min="10"
                  max="100"
                  value={config.tunnelMaxLength}
                  onChange={e => handleFieldChange('tunnelMaxLength', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Tunnel Width & Min Depth */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="tunnelWidth" className="text-sm font-semibold text-slate-700">
                  Tunnel Width
                </label>
                <select
                  id="tunnelWidth"
                  value={config.tunnelWidth}
                  onChange={e => handleFieldChange('tunnelWidth', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                >
                  <option value={1}>1 Tile (Narrow Shaft)</option>
                  <option value={2}>2 Tiles (Wide Shaft)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="tunnelMinDepth" className="text-sm font-semibold text-slate-700">
                  Tunnel Start Depth (Tiles)
                </label>
                <input
                  id="tunnelMinDepth"
                  type="number"
                  min="1"
                  max="10"
                  value={config.tunnelMinDepth}
                  onChange={e => handleFieldChange('tunnelMinDepth', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Resources & Hazards Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>💎</span> Resources & Hazards
              </h3>
              <p className="text-xs text-slate-500">
                Controls mineral ore clustering, stable rock formations, and treasure chest spawns.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor="mineralPercentage" className="text-sm font-semibold text-slate-700">
                  Mineral Veins (%)
                </label>
                <input
                  id="mineralPercentage"
                  type="number"
                  min="1"
                  max="30"
                  value={config.mineralPercentage}
                  onChange={e => handleFieldChange('mineralPercentage', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">% of solid ground.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="rockPercentage" className="text-sm font-semibold text-slate-700">
                  Falling Rocks (%)
                </label>
                <input
                  id="rockPercentage"
                  type="number"
                  min="1"
                  max="40"
                  value={config.rockPercentage}
                  onChange={e => handleFieldChange('rockPercentage', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">Guaranteed supported.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="chestCount" className="text-sm font-semibold text-slate-700">
                  Treasure Chests
                </label>
                <input
                  id="chestCount"
                  type="number"
                  min="0"
                  max="15"
                  value={config.chestCount}
                  onChange={e => handleFieldChange('chestCount', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-slate-400">Placed on cavern floors.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Visual Mini-Map Preview */}
        <div className="lg:col-span-5 space-y-6">
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
                onClick={() => fetchPreview(config, seed)}
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
                onChange={e => setSeed(Number(e.target.value))}
                className="flex-1 px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleRandomizeSeed}
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
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
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
                <span className="w-3 h-3 rounded-xs bg-[#f59e0b] inline-block"></span>
                <span>Minerals</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#eab308] inline-block"></span>
                <span>Chests</span>
              </div>
            </div>

            {/* Summary Metrics */}
            {previewData?.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <div className="text-xl font-black text-blue-600">{previewData.stats.voidPercentage}%</div>
                  <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Cave Openings</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <div className="text-xl font-black text-amber-700">{previewData.stats.solidPercentage}%</div>
                  <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Solid Strata</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <div className="text-xl font-black text-amber-500">{previewData.stats.mineralCount}</div>
                  <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Minerals</div>
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
                  <div className="text-xl font-black text-slate-800">{previewData.stats.totalTiles}</div>
                  <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Total Tiles</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
