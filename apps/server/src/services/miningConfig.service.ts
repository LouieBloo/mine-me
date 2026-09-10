import { prisma } from '../index';
import { DEFAULT_MINING_MAP_CONFIG, type MiningMapConfigData } from '@mine-me/shared';

let cachedConfig: MiningMapConfigData | null = null;

export async function getActiveMiningConfig(): Promise<MiningMapConfigData> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const config = await prisma.miningMapConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (config) {
      cachedConfig = {
        id: config.id,
        name: config.name,
        gridWidth: config.gridWidth,
        gridHeight: config.gridHeight,
        cavernDensity: config.cavernDensity,
        cavernIterations: config.cavernIterations,
        cavernMinDepth: config.cavernMinDepth,
        tunnelCount: config.tunnelCount,
        tunnelMinLength: config.tunnelMinLength,
        tunnelMaxLength: config.tunnelMaxLength,
        tunnelWidth: config.tunnelWidth,
        tunnelMinDepth: config.tunnelMinDepth,
        rockPercentage: config.rockPercentage,
        mineralPercentage: config.mineralPercentage,
        chestCount: config.chestCount,
      };
      return cachedConfig;
    }
  } catch (err) {
    console.error('Failed to load miningMapConfig from DB, using defaults:', err);
  }

  return DEFAULT_MINING_MAP_CONFIG;
}

export async function updateMiningConfig(data: Partial<MiningMapConfigData>): Promise<MiningMapConfigData> {
  const existing = await prisma.miningMapConfig.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });

  const payload = {
    name: data.name ?? existing?.name ?? 'Default',
    gridWidth: data.gridWidth ?? existing?.gridWidth ?? DEFAULT_MINING_MAP_CONFIG.gridWidth,
    gridHeight: data.gridHeight ?? existing?.gridHeight ?? DEFAULT_MINING_MAP_CONFIG.gridHeight,
    cavernDensity: data.cavernDensity ?? existing?.cavernDensity ?? DEFAULT_MINING_MAP_CONFIG.cavernDensity,
    cavernIterations: data.cavernIterations ?? existing?.cavernIterations ?? DEFAULT_MINING_MAP_CONFIG.cavernIterations,
    cavernMinDepth: data.cavernMinDepth ?? existing?.cavernMinDepth ?? DEFAULT_MINING_MAP_CONFIG.cavernMinDepth,
    tunnelCount: data.tunnelCount ?? existing?.tunnelCount ?? DEFAULT_MINING_MAP_CONFIG.tunnelCount,
    tunnelMinLength: data.tunnelMinLength ?? existing?.tunnelMinLength ?? DEFAULT_MINING_MAP_CONFIG.tunnelMinLength,
    tunnelMaxLength: data.tunnelMaxLength ?? existing?.tunnelMaxLength ?? DEFAULT_MINING_MAP_CONFIG.tunnelMaxLength,
    tunnelWidth: data.tunnelWidth ?? existing?.tunnelWidth ?? DEFAULT_MINING_MAP_CONFIG.tunnelWidth,
    tunnelMinDepth: data.tunnelMinDepth ?? existing?.tunnelMinDepth ?? DEFAULT_MINING_MAP_CONFIG.tunnelMinDepth,
    rockPercentage: data.rockPercentage ?? existing?.rockPercentage ?? DEFAULT_MINING_MAP_CONFIG.rockPercentage,
    mineralPercentage: data.mineralPercentage ?? existing?.mineralPercentage ?? DEFAULT_MINING_MAP_CONFIG.mineralPercentage,
    chestCount: data.chestCount ?? existing?.chestCount ?? DEFAULT_MINING_MAP_CONFIG.chestCount,
    isActive: true,
  };

  let saved;
  if (existing) {
    saved = await prisma.miningMapConfig.update({
      where: { id: existing.id },
      data: payload,
    });
  } else {
    saved = await prisma.miningMapConfig.create({
      data: payload,
    });
  }

  cachedConfig = {
    id: saved.id,
    name: saved.name,
    gridWidth: saved.gridWidth,
    gridHeight: saved.gridHeight,
    cavernDensity: saved.cavernDensity,
    cavernIterations: saved.cavernIterations,
    cavernMinDepth: saved.cavernMinDepth,
    tunnelCount: saved.tunnelCount,
    tunnelMinLength: saved.tunnelMinLength,
    tunnelMaxLength: saved.tunnelMaxLength,
    tunnelWidth: saved.tunnelWidth,
    tunnelMinDepth: saved.tunnelMinDepth,
    rockPercentage: saved.rockPercentage,
    mineralPercentage: saved.mineralPercentage,
    chestCount: saved.chestCount,
  };

  return cachedConfig;
}

export async function resetMiningConfig(): Promise<MiningMapConfigData> {
  return updateMiningConfig(DEFAULT_MINING_MAP_CONFIG);
}

export function clearMiningConfigCache(): void {
  cachedConfig = null;
}
