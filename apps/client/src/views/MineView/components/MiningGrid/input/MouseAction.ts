import { MiningTileType, MINING_CONFIG, canPlaceBuildable, type MiningClientTile, type MiningPosition, type Vector2D } from '@mine-me/shared';

export interface ReticleStyle {
  color: number;
  alpha: number;
  strokeColor: number;
  isValid: boolean;
  showPreview?: boolean;
  previewType?: 'TORCH' | 'LADDER';
}

/**
 * Interface defining a mouse-driven action in the mining scene.
 * Follows the Command / Strategy OOP pattern for extensible tools and placeables.
 */
export interface IMouseAction {
  readonly name: string;
  canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean;
  execute(target: MiningPosition, playerPos: Vector2D): Promise<boolean> | boolean;
  getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle;
}

/**
 * Action for placing a Torch within 1 tile of the player.
 */
export class TorchPlacementAction implements IMouseAction {
  public readonly name = 'place_torch';
  private onPlace: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(onPlace: (target: MiningPosition) => Promise<boolean> | boolean) {
    this.onPlace = onPlace;
  }

  /**
   * Validates if a torch can be placed at the target tile:
   * 1. Distance <= 1 tile away from player (Chebyshev distance).
   * 2. Target tile is revealed.
   * 3. Target tile is not an Entrance or already a Torch.
   */
  public canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return false;
    }

    // Check bounds
    if (target.y < 0 || target.y >= grid.length || target.x < 0 || target.x >= (grid[0]?.length || 0)) {
      return false;
    }

    // Distance check: reach within TORCH_PLACEMENT_REACH (1.85 tiles center-to-center)
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - playerPos.x);
    const dy = Math.abs(tileCenterY - playerPos.y);

    if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH) {
      return false;
    }

    const tile = grid[target.y][target.x];
    if (!tile || !tile.revealed) {
      return false;
    }

    if (!canPlaceBuildable(MiningTileType.TORCH, tile.type)) {
      return false;
    }

    return true;
  }

  public async execute(target: MiningPosition, _playerPos?: Vector2D): Promise<boolean> {
    return this.onPlace(target);
  }

  public getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    const valid = this.canExecute(target, playerPos, grid);
    if (valid) {
      return {
        color: 0x22c55e, // Emerald Green
        alpha: 0.3,
        strokeColor: 0x4ade80,
        isValid: true,
        showPreview: true,
        previewType: 'TORCH',
      };
    }
    return {
      color: 0xef4444, // Bright Red
      alpha: 0.3,
      strokeColor: 0xf87171,
      isValid: false,
      showPreview: false,
    };
  }
}

/**
 * Action for placing a Ladder within 1 tile of the player.
 */
export class LadderPlacementAction implements IMouseAction {
  public readonly name = 'place_ladder';
  private onPlace: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(onPlace: (target: MiningPosition) => Promise<boolean> | boolean) {
    this.onPlace = onPlace;
  }

  /**
   * Validates if a ladder can be placed at the target tile:
   * 1. Distance <= 1 tile away from player (Chebyshev distance).
   * 2. Target tile is within bounds and revealed.
   * 3. Target tile is not an Entrance or already a Ladder.
   */
  public canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return false;
    }

    // Check bounds
    if (target.y < 0 || target.y >= grid.length || target.x < 0 || target.x >= (grid[0]?.length || 0)) {
      return false;
    }

    // Distance check: reach within TORCH_PLACEMENT_REACH (1.85 tiles center-to-center)
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - playerPos.x);
    const dy = Math.abs(tileCenterY - playerPos.y);

    if (dx > MINING_CONFIG.TORCH_PLACEMENT_REACH || dy > MINING_CONFIG.TORCH_PLACEMENT_REACH) {
      return false;
    }

    const tile = grid[target.y][target.x];
    if (!tile || !tile.revealed) {
      return false;
    }

    if (!canPlaceBuildable(MiningTileType.LADDER, tile.type)) {
      return false;
    }

    return true;
  }

  public async execute(target: MiningPosition, _playerPos?: Vector2D): Promise<boolean> {
    return this.onPlace(target);
  }

  public getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    const valid = this.canExecute(target, playerPos, grid);
    if (valid) {
      return {
        color: 0x22c55e, // Emerald Green
        alpha: 0.3,
        strokeColor: 0x4ade80,
        isValid: true,
        showPreview: true,
        previewType: 'LADDER',
      };
    }
    return {
      color: 0xef4444, // Bright Red
      alpha: 0.3,
      strokeColor: 0xf87171,
      isValid: false,
      showPreview: false,
    };
  }
}
