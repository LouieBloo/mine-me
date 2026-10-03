import type { MiningMapConfigData } from '@mine-me/shared';

/**
 * Shared props for all MiningConfig sub-components that modify config fields.
 */
export interface MiningConfigFieldProps {
  config: MiningMapConfigData;
  onFieldChange: <K extends keyof MiningMapConfigData>(field: K, value: MiningMapConfigData[K]) => void;
}
