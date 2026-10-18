import { BLOCK_SCALE, type MiningMapConfigData } from '@mine-me/shared';
import './MiningConfigPresets.css';

/** Preset bank for quick configuration. Depths, lengths and widths are in blocks, which are 1/BLOCK_SCALE of the size they once were. */
export const PRESETS: Record<string, Partial<MiningMapConfigData>> = {
  'Default Balanced': {
    cavernDensity: 42,
    cavernIterations: 3,
    cavernMinDepth: 4 * BLOCK_SCALE,
    tunnelCount: 5,
    tunnelMinLength: 15 * BLOCK_SCALE,
    tunnelMaxLength: 30 * BLOCK_SCALE,
    tunnelWidth: 1 * BLOCK_SCALE,
    tunnelMinDepth: 2 * BLOCK_SCALE,
    rockPercentage: 12,
    mineralPercentage: 10,
    chestCount: 4,
    copperiumPercentage: 4,
    silveriumPercentage: 2,
    silveriumMinDepth: 12 * BLOCK_SCALE,
    oreClusterChance: 65,
    mobSpawnCount: 3,
    mobSpawnMinDepth: 5 * BLOCK_SCALE,
  },
  'Sprawling Caverns': {
    cavernDensity: 65,
    cavernIterations: 4,
    cavernMinDepth: 3 * BLOCK_SCALE,
    tunnelCount: 6,
    tunnelMinLength: 20 * BLOCK_SCALE,
    tunnelMaxLength: 40 * BLOCK_SCALE,
    tunnelWidth: 2 * BLOCK_SCALE,
    tunnelMinDepth: 2 * BLOCK_SCALE,
    rockPercentage: 10,
    mineralPercentage: 12,
    chestCount: 6,
    copperiumPercentage: 5,
    silveriumPercentage: 3,
    silveriumMinDepth: 10 * BLOCK_SCALE,
    oreClusterChance: 70,
    mobSpawnCount: 5,
    mobSpawnMinDepth: 4 * BLOCK_SCALE,
  },
  'Winding Labyrinth': {
    cavernDensity: 20,
    cavernIterations: 3,
    cavernMinDepth: 6 * BLOCK_SCALE,
    tunnelCount: 12,
    tunnelMinLength: 25 * BLOCK_SCALE,
    tunnelMaxLength: 45 * BLOCK_SCALE,
    tunnelWidth: 1 * BLOCK_SCALE,
    tunnelMinDepth: 2 * BLOCK_SCALE,
    rockPercentage: 14,
    mineralPercentage: 10,
    chestCount: 5,
    copperiumPercentage: 3,
    silveriumPercentage: 2,
    silveriumMinDepth: 14 * BLOCK_SCALE,
    oreClusterChance: 60,
    mobSpawnCount: 4,
    mobSpawnMinDepth: 6 * BLOCK_SCALE,
  },
  'Solid Deep Core': {
    cavernDensity: 15,
    cavernIterations: 2,
    cavernMinDepth: 10 * BLOCK_SCALE,
    tunnelCount: 3,
    tunnelMinLength: 10 * BLOCK_SCALE,
    tunnelMaxLength: 20 * BLOCK_SCALE,
    tunnelWidth: 1 * BLOCK_SCALE,
    tunnelMinDepth: 5 * BLOCK_SCALE,
    rockPercentage: 18,
    mineralPercentage: 14,
    chestCount: 4,
    copperiumPercentage: 6,
    silveriumPercentage: 4,
    silveriumMinDepth: 8 * BLOCK_SCALE,
    oreClusterChance: 80,
    mobSpawnCount: 2,
    mobSpawnMinDepth: 10 * BLOCK_SCALE,
  },
};

interface MiningConfigPresetsProps {
  onApplyPreset: (presetName: string) => void;
}

export default function MiningConfigPresets({ onApplyPreset }: MiningConfigPresetsProps) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Presets:</span>
      {Object.keys(PRESETS).map(name => (
        <button
          key={name}
          type="button"
          onClick={() => onApplyPreset(name)}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          {name}
        </button>
      ))}
    </div>
  );
}
