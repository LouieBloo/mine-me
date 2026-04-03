import type { GearSubType } from './types';

export const GEAR_OFFSETS: Record<GearSubType, { x: number; y: number }> = {
    HEAD: { x: 33, y: -293 },
    SHOULDERS: { x: 1, y: -203 },
    CHEST: { x: 25, y: -136 },
    GAUNTLETS: { x: 31, y: -39 },
    LEGGINGS: { x: 11, y: 34 },
    BOOTS: { x: 23, y: 221 },
    WEAPON: { x: 0, y: 91 }
};
