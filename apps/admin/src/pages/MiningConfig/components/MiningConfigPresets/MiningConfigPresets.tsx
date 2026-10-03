import type { MiningMapConfigData } from '@mine-me/shared';
import './MiningConfigPresets.css';

/** Preset bank for quick configuration */
export const PRESETS: Record<string, Partial<MiningMapConfigData>> = {
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
    copperiumPercentage: 4,
    silveriumPercentage: 2,
    silveriumMinDepth: 12,
    oreClusterChance: 65,
    mobSpawnCount: 3,
    mobSpawnMinDepth: 5,
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
    copperiumPercentage: 5,
    silveriumPercentage: 3,
    silveriumMinDepth: 10,
    oreClusterChance: 70,
    mobSpawnCount: 5,
    mobSpawnMinDepth: 4,
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
    copperiumPercentage: 3,
    silveriumPercentage: 2,
    silveriumMinDepth: 14,
    oreClusterChance: 60,
    mobSpawnCount: 4,
    mobSpawnMinDepth: 6,
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
    copperiumPercentage: 6,
    silveriumPercentage: 4,
    silveriumMinDepth: 8,
    oreClusterChance: 80,
    mobSpawnCount: 2,
    mobSpawnMinDepth: 10,
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
