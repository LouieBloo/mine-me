import { DEFAULT_MINING_MAP_CONFIG, type FireDamageRule, type MiningMapConfigData, type SpeedDamageRule } from '@mine-me/shared';

/** The map config's fall damage rule (falls back to the game defaults for missing fields). */
export function fallDamageRule(config?: Partial<MiningMapConfigData>): SpeedDamageRule {
  return {
    minSpeed: config?.fallDamageMinSpeed ?? DEFAULT_MINING_MAP_CONFIG.fallDamageMinSpeed ?? 0,
    perSpeed: config?.fallDamagePerSpeed ?? DEFAULT_MINING_MAP_CONFIG.fallDamagePerSpeed ?? 0,
    max: config?.fallDamageMax ?? DEFAULT_MINING_MAP_CONFIG.fallDamageMax ?? 0,
  };
}

/** The map config's falling rock damage rule (falls back to the game defaults for missing fields). */
export function rockDamageRule(config?: Partial<MiningMapConfigData>): SpeedDamageRule {
  return {
    minSpeed: config?.rockDamageMinSpeed ?? DEFAULT_MINING_MAP_CONFIG.rockDamageMinSpeed ?? 0,
    perSpeed: config?.rockDamagePerSpeed ?? DEFAULT_MINING_MAP_CONFIG.rockDamagePerSpeed ?? 0,
    max: config?.rockDamageMax ?? DEFAULT_MINING_MAP_CONFIG.rockDamageMax ?? 0,
  };
}

/** The map config's fire rule: burning and heat damage (falls back to the game defaults for missing fields). */
export function fireDamageRule(config?: Partial<MiningMapConfigData>): FireDamageRule {
  return {
    burnDamagePerSecond: config?.burnDamagePerSecond ?? DEFAULT_MINING_MAP_CONFIG.burnDamagePerSecond ?? 0,
    burnSeconds: config?.burnSeconds ?? DEFAULT_MINING_MAP_CONFIG.burnSeconds ?? 0,
    heatRadius: config?.heatRadius ?? DEFAULT_MINING_MAP_CONFIG.heatRadius ?? 0,
    heatDamagePerSecond: config?.heatDamagePerSecond ?? DEFAULT_MINING_MAP_CONFIG.heatDamagePerSecond ?? 0,
  };
}
