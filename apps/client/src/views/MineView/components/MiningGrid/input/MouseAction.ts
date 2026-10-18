import { BLOCK_SCALE } from '@mine-me/shared';
import {
  MiningTileType,
  MINING_CONFIG,
  canPlaceBuildable,
  bodyOverlapsCell,
  findPieceAnchor,
  getTileFootprint,
  pieceCentre,
  MouseActionTriggerMode,
  calculateThrowVelocity,
  type MiningClientTile,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';

const PLAYER_HALF_WIDTH = MINING_CONFIG.PLAYER_COLLIDER_WIDTH_TILES / 2;
const PLAYER_HALF_HEIGHT = MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2;

export interface ReticleStyle {
  color: number;
  alpha: number;
  strokeColor: number;
  isValid: boolean;
  showPreview?: boolean;
  previewType?: 'TORCH' | 'LADDER' | 'BRIDGE';
  isFreeAim?: boolean;
  trajectoryPoints?: Vector2D[];
  isCharging?: boolean;
  chargeRatio?: number;
  isOvercharged?: boolean;
  /** The blocks a pickaxe has lined up, nearest first (the first is the one being mined).
   */
  miningQueue?: MiningPosition[];
  /** A multi-cell placement's area in cells (top-left cell and size); the reticle covers all of it. */
  pieceArea?: { x: number; y: number; width: number; height: number };
}

export interface MouseActionConfig {
  name: string;
  triggerMode: MouseActionTriggerMode;
  /** Minimum delay in milliseconds between executions when triggerMode is HOLD. Defaults to 0. */
  cooldownMs?: number;
  /** When true, this action targets continuous world float coordinates rather than snapped grid tiles */
  isContinuous?: boolean;
  /** When true, a cursor outside the map targets the nearest edge tile (see IMouseAction.clampsToGrid) */
  clampsToGrid?: boolean;
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
  /**
   * When true, a cursor outside the map targets the nearest tile on its edge instead of nothing
   * (the sandbox's fluid and fire tools work above and beside the map).
   */
  readonly clampsToGrid?: boolean;
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
  public readonly clampsToGrid: boolean;

  constructor(config: MouseActionConfig) {
    this.name = config.name;
    this.triggerMode = config.triggerMode;
    this.cooldownMs = config.cooldownMs ?? 0;
    this.isContinuous = config.isContinuous ?? false;
    this.clampsToGrid = config.clampsToGrid ?? false;
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

/**
 * Where a placeable would go if the player points at `cursor`: the top-left cell of its piece, nudged to the
 * nearest spot where every cell is on the map, uncovered and empty (and, for solid pieces, clear of the player),
 * and the piece's middle is within `reach` of the player. Null if it cannot go anywhere around the cursor.
 * The server runs the same shared search, so what the reticle shows is what a click will do.
 */
export function resolveBuildableAnchor(
  buildableType: MiningTileType,
  cursor: MiningPosition,
  playerPos: Vector2D,
  grid: MiningClientTile[][],
  reach: number,
  blockedByPlayer: boolean
): MiningPosition | null {
  if (!cursor || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') return null;
  if (cursor.y < 0 || cursor.y >= grid.length || cursor.x < 0 || cursor.x >= (grid[0]?.length || 0)) return null;

  const footprint = getTileFootprint(buildableType);
  const anchor = findPieceAnchor(cursor, footprint, (x, y) => {
    const tile = grid[y]?.[x];
    if (!tile || !tile.revealed || !canPlaceBuildable(buildableType, tile.type)) return false;
    // Something solid cannot go on top of the player
    return !(blockedByPlayer && bodyOverlapsCell(playerPos, PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT, x, y));
  });
  if (!anchor) return null;

  const centre = pieceCentre(anchor, footprint);
  return Math.abs(centre.x - playerPos.x) > reach || Math.abs(centre.y - playerPos.y) > reach ? null : anchor;
}

export interface BuildablePlacementConfig extends MouseActionConfig {
  buildableType: MiningTileType;
  previewType: 'TORCH' | 'LADDER' | 'BRIDGE';
  onPlace: (target: MiningPosition) => Promise<boolean> | boolean;
  reach?: number;
  blockedByPlayer?: boolean;
}

/**
 * Abstract base class for placing buildable tiles (torches, ladders, blocks, etc.).
 * Standardizes boundary checking, reach radius, revealed requirement, buildable rules,
 * reticle previews, and place callbacks.
 */
export abstract class BaseBuildablePlacementAction extends BaseMouseAction {
  public readonly buildableType: MiningTileType;
  public readonly previewType: 'TORCH' | 'LADDER' | 'BRIDGE';
  public readonly reach: number;
  protected onPlace: (target: MiningPosition) => Promise<boolean> | boolean;
  /** True for solid buildables (bridges), which cannot be placed into the player's own space. */
  protected readonly blockedByPlayer: boolean;

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
    this.blockedByPlayer = config.blockedByPlayer ?? false;
  }

  /**
   * Validates if the buildable item can be placed at the target tile:
   * 1. Target coordinate is within grid bounds.
   * 2. Target tile is within reach distance from player position.
   * 3. Target tile is revealed (not hidden in fog of war).
   * 4. Tile allows this buildable type (not entrance, not already this type).
   */
  public canExecute(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    return resolveBuildableAnchor(this.buildableType, target, playerPos, grid, this.reach, this.blockedByPlayer) !== null;
  }

  public async execute(target: MiningPosition, _playerPos?: Vector2D): Promise<boolean> {
    return this.onPlace(target);
  }

  public getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    const footprint = getTileFootprint(this.buildableType);
    const anchor = resolveBuildableAnchor(this.buildableType, target, playerPos, grid, this.reach, this.blockedByPlayer);
    // Where the piece would go, or (when it cannot) the area centred on the cursor so the red box still shows its size
    const area = anchor
      ? { x: anchor.x, y: anchor.y, ...footprint }
      : { x: target.x - Math.floor(footprint.width / 2), y: target.y - Math.floor(footprint.height / 2), ...footprint };
    if (anchor) {
      return {
        pieceArea: area,
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
      pieceArea: area,
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
 * Action for placing a Bridge (a solid, walkable tile) within reach of the player. Defaults to HOLD so a
 * bridge can be laid down while running, but can be configured dynamically by item definition.
 */
export class BridgePlacementAction extends BaseBuildablePlacementAction {
  constructor(
    onPlace: (target: MiningPosition) => Promise<boolean> | boolean,
    triggerMode: MouseActionTriggerMode = MouseActionTriggerMode.HOLD
  ) {
    super({
      name: 'place_bridge',
      buildableType: MiningTileType.BRIDGE,
      previewType: 'BRIDGE',
      triggerMode,
      onPlace,
      blockedByPlayer: true,
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

    const throwPower = this.physicsConfig?.throwPower ?? 20.5 * BLOCK_SCALE;
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

export interface ShootWeaponActionConfig {
  name?: string;
  weaponItemId?: string;
  fireRate?: number;
  triggerMode?: MouseActionTriggerMode;
  onShoot: (target: Vector2D) => Promise<boolean> | boolean;
}

/**
 * Action for firing projectile weapons (e.g. 6-shooter revolver).
 * Uses free-aim crosshairs targeting sub-tile continuous world coordinates.
 */
export class ShootWeaponAction extends BaseMouseAction {
  protected onShoot: (target: Vector2D) => Promise<boolean> | boolean;
  public readonly weaponItemId?: string;
  public readonly fireRate: number;

  constructor(config: ShootWeaponActionConfig) {
    const fireRate = config.fireRate ?? 2.5;
    const cooldownMs = Math.round(1000 / fireRate);
    super({
      name: config.name || 'shoot_weapon',
      triggerMode: config.triggerMode ?? MouseActionTriggerMode.SINGLE,
      cooldownMs,
      isContinuous: true,
    });
    this.onShoot = config.onShoot;
    this.weaponItemId = config.weaponItemId;
    this.fireRate = fireRate;
  }

  public canExecute(
    _target: MiningPosition | Vector2D,
    _playerPos: Vector2D,
    _grid: MiningClientTile[][]
  ): boolean {
    return true;
  }

  public async execute(
    target: MiningPosition | Vector2D,
    _playerPos?: Vector2D
  ): Promise<boolean> {
    return this.onShoot(target as Vector2D);
  }

  public getReticleStyle(
    _target: MiningPosition | Vector2D,
    _playerPos: Vector2D,
    _grid: MiningClientTile[][]
  ): ReticleStyle {
    return {
      color: 0xf97316,
      alpha: 0.9,
      strokeColor: 0xea580c,
      isValid: true,
      showPreview: false,
      isFreeAim: true,
    };
  }
}

