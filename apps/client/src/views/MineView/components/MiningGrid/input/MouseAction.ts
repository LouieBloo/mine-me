import {
  MiningTileType,
  MINING_CONFIG,
  canPlaceBuildable,
  MouseActionTriggerMode,
  calculateThrowVelocity,
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
  isFreeAim?: boolean;
  trajectoryPoints?: Vector2D[];
  isCharging?: boolean;
  chargeRatio?: number;
  isOvercharged?: boolean;
}

export interface MouseActionConfig {
  name: string;
  triggerMode: MouseActionTriggerMode;
  /** Minimum delay in milliseconds between executions when triggerMode is HOLD. Defaults to 0. */
  cooldownMs?: number;
  /** When true, this action targets continuous world float coordinates rather than snapped grid tiles */
  isContinuous?: boolean;
}

/**
 * Interface defining a mouse-driven action in the mining scene.
 * Follows the Command / Strategy OOP pattern for extensible tools and placeables.
 */
export interface IMouseAction {
  readonly name: string;
  readonly triggerMode: MouseActionTriggerMode;
  readonly cooldownMs?: number;
  readonly isContinuous?: boolean;
  canExecute(target: MiningPosition | Vector2D, playerPos: Vector2D, grid: MiningClientTile[][]): boolean;
  execute(target: MiningPosition | Vector2D, playerPos: Vector2D): Promise<boolean> | boolean;
  getReticleStyle(target: MiningPosition | Vector2D, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle;
}

/**
 * Base abstract class for all mining mouse actions.
 */
export abstract class BaseMouseAction implements IMouseAction {
  public readonly name: string;
  public readonly triggerMode: MouseActionTriggerMode;
  public readonly cooldownMs: number;
  public readonly isContinuous: boolean;

  constructor(config: MouseActionConfig) {
    this.name = config.name;
    this.triggerMode = config.triggerMode;
    this.cooldownMs = config.cooldownMs ?? 0;
    this.isContinuous = config.isContinuous ?? false;
  }

  public abstract canExecute(
    target: MiningPosition | Vector2D,
    playerPos: Vector2D,
    grid: MiningClientTile[][]
  ): boolean;

  public abstract execute(target: MiningPosition | Vector2D, playerPos?: Vector2D): Promise<boolean> | boolean;

  public abstract getReticleStyle(
    target: MiningPosition | Vector2D,
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

export interface ThrowableActionConfig extends Partial<MouseActionConfig> {
  onThrow: (target: Vector2D, forceRatio: number) => Promise<boolean> | boolean;
  maxChargeTimeMs?: number;
  maxHoldTimeMs?: number;
  itemId?: string;
  physicsConfig?: any;
}

/**
 * Action for throwing generic throwable items (dynamite, bombs, etc.).
 * Supports hold-to-charge force scaling with parabolic trajectory preview
 * and overcharge cancellation.
 */
export class ThrowableItemAction extends BaseMouseAction {
  protected onThrow: (target: Vector2D, forceRatio: number) => Promise<boolean> | boolean;
  public readonly maxChargeTimeMs: number;
  public readonly maxHoldTimeMs: number;
  public readonly itemId?: string;
  public readonly physicsConfig?: any;

  private _isCharging: boolean = false;
  private _chargeStartTime: number = 0;
  private _chargeRatio: number = 0;
  private _isOvercharged: boolean = false;

  constructor(config: ThrowableActionConfig) {
    super({
      name: config.name || 'throw_item',
      triggerMode: config.triggerMode ?? MouseActionTriggerMode.SINGLE,
      cooldownMs: config.cooldownMs ?? 200,
      isContinuous: true,
    });
    this.onThrow = config.onThrow;
    this.maxChargeTimeMs = config.maxChargeTimeMs ?? 750;
    this.maxHoldTimeMs = config.maxHoldTimeMs ?? 2000;
    this.itemId = config.itemId;
    this.physicsConfig = config.physicsConfig;
  }

  public get isCharging(): boolean {
    return this._isCharging;
  }

  public get isOvercharged(): boolean {
    return this._isOvercharged;
  }

  public get chargeRatio(): number {
    return this._chargeRatio;
  }

  public startCharging(): void {
    this._isCharging = true;
    this._chargeStartTime = performance.now();
    this._chargeRatio = 0.05;
    this._isOvercharged = false;
  }

  public updateCharge(now: number = performance.now()): void {
    if (!this._isCharging) return;
    const elapsed = now - this._chargeStartTime;
    if (elapsed >= this.maxHoldTimeMs) {
      this._isOvercharged = true;
      this._chargeRatio = 0;
    } else {
      this._isOvercharged = false;
      this._chargeRatio = Math.min(1.0, Math.max(0.05, elapsed / this.maxChargeTimeMs));
    }
  }

  public stopCharging(): { isOvercharged: boolean; forceRatio: number } {
    const wasOvercharged = this._isOvercharged;
    const ratio = this._chargeRatio;
    this._isCharging = false;
    this._chargeStartTime = 0;
    this._chargeRatio = 0;
    this._isOvercharged = false;
    return { isOvercharged: wasOvercharged, forceRatio: ratio };
  }

  public cancelCharging(): void {
    this._isCharging = false;
    this._chargeStartTime = 0;
    this._chargeRatio = 0;
    this._isOvercharged = false;
  }

  public canExecute(
    _target: MiningPosition | Vector2D,
    _playerPos: Vector2D,
    _grid: MiningClientTile[][]
  ): boolean {
    return !this._isOvercharged;
  }

  public async execute(target: MiningPosition | Vector2D, _playerPos?: Vector2D, forceRatio?: number): Promise<boolean> {
    const ratio = forceRatio ?? (this._chargeRatio > 0 ? this._chargeRatio : 1.0);
    return this.onThrow(target as Vector2D, ratio);
  }

  public computeTrajectory(
    playerPos: Vector2D,
    target: Vector2D,
    forceRatio: number,
    grid?: MiningClientTile[][],
    stepCount: number = 45,
    dt: number = 0.035
  ): Vector2D[] {
    const points: Vector2D[] = [];
    const startX = playerPos.x;
    const startY = playerPos.y;

    const throwPower = this.physicsConfig?.throwPower ?? 20.5;
    const gravityScale = this.physicsConfig?.gravityScale ?? 1.0;
    const gravity = MINING_CONFIG.GRAVITY * gravityScale;

    const initialVel = calculateThrowVelocity(
      startX,
      startY,
      target.x,
      target.y,
      forceRatio,
      throwPower,
      MINING_CONFIG.GRAVITY,
      gravityScale,
      target.x < startX
    );

    let curX = startX;
    let curY = startY;
    let curVx = initialVel.x;
    let curVy = initialVel.y;

    points.push({ x: curX, y: curY });

    for (let i = 0; i < stepCount; i++) {
      curX += curVx * dt;
      curY += curVy * dt;
      curVy += gravity * dt;

      if (grid && grid.length > 0) {
        const tileX = Math.floor(curX);
        const tileY = Math.floor(curY);
        if (
          tileY >= 0 &&
          tileY < grid.length &&
          tileX >= 0 &&
          tileX < (grid[0]?.length || 0)
        ) {
          const tile = grid[tileY][tileX];
          if (
            tile &&
            tile.type !== MiningTileType.EMPTY &&
            tile.type !== MiningTileType.LADDER &&
            tile.type !== MiningTileType.TORCH
          ) {
            points.push({ x: curX, y: curY });
            break;
          }
        } else if (tileY >= grid.length || tileX < 0 || tileX >= (grid[0]?.length || 0)) {
          points.push({ x: curX, y: curY });
          break;
        }
      }

      points.push({ x: curX, y: curY });
    }

    return points;
  }

  public getReticleStyle(
    target: MiningPosition | Vector2D,
    playerPos: Vector2D,
    grid: MiningClientTile[][]
  ): ReticleStyle {
    let trajectoryPoints: Vector2D[] | undefined;
    if (this._isCharging && !this._isOvercharged && this._chargeRatio > 0) {
      trajectoryPoints = this.computeTrajectory(playerPos, target as Vector2D, this._chargeRatio, grid);
    }

    return {
      color: 0xef4444,
      alpha: this._isOvercharged ? 0.3 : 0.85,
      strokeColor: this._isOvercharged ? 0x6b7280 : 0xb91c1c,
      isValid: !this._isOvercharged,
      showPreview: false,
      isFreeAim: true,
      trajectoryPoints,
      isCharging: this._isCharging,
      chargeRatio: this._chargeRatio,
      isOvercharged: this._isOvercharged,
    };
  }
}

/**
 * Action for throwing Dynamite towards the mouse cursor.
 * Subclasses ThrowableItemAction for backwards compatibility and generic mechanics.
 */
export class DynamiteThrowAction extends ThrowableItemAction {
  constructor(
    onThrow: (target: MiningPosition | Vector2D, forceRatio?: number) => Promise<boolean> | boolean,
    triggerMode: MouseActionTriggerMode = MouseActionTriggerMode.SINGLE,
    options?: { maxChargeTimeMs?: number; maxHoldTimeMs?: number; itemId?: string; physicsConfig?: any }
  ) {
    super({
      name: 'throw_dynamite',
      triggerMode,
      onThrow: (target, ratio) => onThrow(target, ratio),
      maxChargeTimeMs: options?.maxChargeTimeMs,
      maxHoldTimeMs: options?.maxHoldTimeMs,
      itemId: options?.itemId,
      physicsConfig: options?.physicsConfig,
    });
  }
}
