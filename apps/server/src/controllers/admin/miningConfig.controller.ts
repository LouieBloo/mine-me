import { Request, Response } from 'express';
import {
  getActiveMiningConfig,
  updateMiningConfig as saveMiningConfig,
  resetMiningConfig as restoreMiningConfig,
} from '../../services/miningConfig.service';
import { generateMiningMap } from '../../services/miningMap.service';
import { MiningTileType, isTileSolid, MINING_CONFIG } from '@mine-me/shared';

/**
 * Get active mining map generator configuration.
 */
export const getMiningConfig = async (req: Request, res: Response) => {
  try {
    const config = await getActiveMiningConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch mining configuration' });
  }
};

/**
 * Update mining map generator configuration.
 */
export const updateMiningConfig = async (req: Request, res: Response) => {
  try {
    const updated = await saveMiningConfig(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update mining configuration' });
  }
};

/**
 * Generate a 2D map preview and summary statistics without saving.
 */
export const generateMapPreview = async (req: Request, res: Response) => {
  try {
    const seed = typeof req.body.seed === 'number' ? req.body.seed : Math.floor(Math.random() * 2147483647);
    const draftConfig = req.body.config ?? req.body;

    const grid = generateMiningMap({
      seed,
      config: draftConfig,
    });

    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    const totalTiles = width * height;
    const totalUnderground = Math.max(1, (height - 1) * width);

    let emptyCount = 0;
    let solidCount = 0;
    let mineralCount = 0;
    let rockCount = 0;
    let chestCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = grid[y][x].type;
        if (type === MiningTileType.EMPTY) {
          emptyCount++;
        } else if (type === MiningTileType.MINERAL) {
          mineralCount++;
          solidCount++;
        } else if (type === MiningTileType.ROCK) {
          rockCount++;
          solidCount++;
        } else if (type === MiningTileType.CHEST) {
          chestCount++;
          solidCount++;
        } else if (isTileSolid(type)) {
          solidCount++;
        }
      }
    }

    const voidPercentage = Math.round((emptyCount / totalUnderground) * 1000) / 10;
    const solidPercentage = Math.round((solidCount / totalUnderground) * 1000) / 10;

    res.json({
      seed,
      stats: {
        width,
        height,
        totalTiles,
        emptyCount,
        solidCount,
        mineralCount,
        rockCount,
        chestCount,
        voidPercentage,
        solidPercentage,
      },
      // Compact tile matrix representation for preview rendering
      tiles: grid.map(row => row.map(tile => tile.type)),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate map preview' });
  }
};

/**
 * Reset mining map generator configuration back to system default.
 */
export const resetMiningConfig = async (req: Request, res: Response) => {
  try {
    const reset = await restoreMiningConfig();
    res.json(reset);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset mining configuration' });
  }
};
