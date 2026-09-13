import {
  MiningTileType,
  MINING_CONFIG,
  canPlaceBuildable,
  MouseActionTriggerMode,
  type MiningClientTile,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';

export interface ReticleStyle {
  color: number;
  alpha: number;
  strokeColor: number;
  isValid: boolean;
  showPreview?: boolean;
  previewType?: 'TORCH' | 'LADDER';
}

export interface MouseActionConfig {
  name: string;
  triggerMode: MouseActionTriggerMode;
  /** Minimum delay in milliseconds between executions when triggerMode is HOLD. Defaults to 0. */
  cooldownMs?: number;
}

/**
 * Interface defining a mouse-driven action in the mining scene.
 * Follows the Command / Strategy OOP pattern for extensible tools and placeables.
 */
export interface IMouseAction {
  readonly name: string;
  readonly triggerMode: MouseActionTriggerMode;
  readonly cooldownMs?: number;
  canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean;
  execute(target: MiningPosition, playerPos: Vector2D): Promise<boolean> | boolean;
  getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle;
}

/**
 * Base abstract class for all mining mouse actions.
 */
export abstract class BaseMouseAction implements IMouseAction {
  public readonly name: string;
  public readonly triggerMode: MouseActionTriggerMode;
  public readonly cooldownMs: number;

  constructor(config: MouseActionConfig) {
    this.name = config.name;
    this.triggerMode = config.triggerMode;
    this.cooldownMs = config.cooldownMs ?? 0;
  }

  public abstract canExecute(
    target: MiningPosition,
    playerPos: Vector2D,
    grid: MiningClientTile[][]
  ): boolean;

  public abstract execute(target: MiningPosition, playerPos?: Vector2D): Promise<boolean> | boolean;

  public abstract getReticleStyle(
    target: MiningPosition,
    playerPos: Vector2D,
    grid: MiningClientTile[][]
  ): ReticleStyle;
}

export interface BuildablePlacementConfig extends MouseActionConfig {
  buildableType: MiningTileType;
  previewType: 'TORCH' | 'LADDER';
  onPlace: (target: MiningPosition) => Promise<boolean> | boolean;
  reach?: number;
}

/**
 * Abstract base class for placing buildable tiles (torches, ladders, blocks, etc.).
 * Standardizes boundary checking, reach radius, revealed requirement, buildable rules,
 * reticle previews, and place callbacks.
 */
export abstract class BaseBuildablePlacementAction extends BaseMouseAction {
  public readonly buildableType: MiningTileType;
  public readonly previewType: 'TORCH' | 'LADDER';
  public readonly reach: number;
  protected onPlace: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(config: BuildablePlacementConfig) {
    super({
      name: config.name,
      triggerMode: config.triggerMode,
      cooldownMs: config.cooldownMs,
    });
    this.buildableType = config.buildableType;
    this.previewType = config.previewType;
    this.reach = config.reach ?? MINING_CONFIG.TORCH_PLACEMENT_REACH;
    this.onPlace = config.onPlace;
  }

  /**
   * Validates if the buildable item can be placed at the target tile:
   * 1. Target coordinate is within grid bounds.
   * 2. Target tile is within reach distance from player position.
   * 3. Target tile is revealed (not hidden in fog of war).
   * 4. Tile allows this buildable type (not entrance, not already this type).
   */
  public canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return false;
    }

    // Boundary check
    if (target.y < 0 || target.y >= grid.length || target.x < 0 || target.x >= (grid[0]?.length || 0)) {
      return false;
    }

    // Distance check center-to-center
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - playerPos.x);
    const dy = Math.abs(tileCenterY - playerPos.y);

    if (dx > this.reach || dy > this.reach) {
      return false;
    }

    const tile = grid[target.y]?.[target.x];
    if (!tile || !tile.revealed) {
      return false;
    }

    if (!canPlaceBuildable(this.buildableType, tile.type)) {
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
        previewType: this.previewType,
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
 * Action for placing a Torch within reach of the player.
 * Defaults to MouseActionTriggerMode.SINGLE, but can be configured dynamically by item definition.
 */
export class TorchPlacementAction extends BaseBuildablePlacementAction {
  constructor(
    onPlace: (target: MiningPosition) => Promise<boolean> | boolean,
    triggerMode: MouseActionTriggerMode = MouseActionTriggerMode.SINGLE
  ) {
    super({
      name: 'place_torch',
      buildableType: MiningTileType.TORCH,
      previewType: 'TORCH',
      triggerMode,
      onPlace,
    });
  }
}

/**
 * Action for placing a Ladder within reach of the player.
 * Defaults to MouseActionTriggerMode.HOLD, but can be configured dynamically by item definition.
 */
export class LadderPlacementAction extends BaseBuildablePlacementAction {
  constructor(
    onPlace: (target: MiningPosition) => Promise<boolean> | boolean,
    triggerMode: MouseActionTriggerMode = MouseActionTriggerMode.HOLD
  ) {
    super({
      name: 'place_ladder',
      buildableType: MiningTileType.LADDER,
      previewType: 'LADDER',
      triggerMode,
      onPlace,
    });
  }
}

/**
 * Action for throwing Dynamite towards the mouse cursor.
 * Triggered on click (SINGLE mode) or configured item triggerMode.
 */
export class DynamiteThrowAction extends BaseMouseAction {
  protected onThrow: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(
    onThrow: (target: MiningPosition) => Promise<boolean> | boolean,
    triggerMode: MouseActionTriggerMode = MouseActionTriggerMode.SINGLE
  ) {
    super({
      name: 'throw_dynamite',
      triggerMode,
    });
    this.onThrow = onThrow;
  }

  public canExecute(
    _target: MiningPosition,
    _playerPos: Vector2D,
    _grid: MiningClientTile[][]
  ): boolean {
    return true;
  }

  public async execute(target: MiningPosition, _playerPos?: Vector2D): Promise<boolean> {
    return this.onThrow(target);
  }

  public getReticleStyle(
    _target: MiningPosition,
    _playerPos: Vector2D,
    _grid: MiningClientTile[][]
  ): ReticleStyle {
    return {
      color: 0xef4444,
      alpha: 0.85,
      strokeColor: 0xb91c1c,
      isValid: true,
      showPreview: false,
    };
  }
}
