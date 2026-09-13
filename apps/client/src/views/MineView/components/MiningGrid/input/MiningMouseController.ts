import {
  MINING_CONFIG,
  MiningTileType,
  MouseActionTriggerMode,
  isTileMineable,
  type MiningClientTile,
  type MiningPosition,
  type Vector2D,
} from '@mine-me/shared';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import type { IMouseAction, ReticleStyle } from './MouseAction';

export interface MouseControllerOptions {
  tileSize?: number;
}

/**
 * Object-Oriented Controller for managing all mouse interactions, coordinate transformations,
 * placement actions, mining states, and hover states on the mining grid.
 */
export class MiningMouseController {
  private canvas: HTMLCanvasElement | null = null;
  private camera: Camera2D | null = null;
  private grid: MiningClientTile[][] = [];
  private playerPos: Vector2D = { x: 0, y: 0 };
  private tileSize: number;

  private isMouseDown = false;
  private isExecutingAction = false;
  private lastExecutedTarget: MiningPosition | null = null;
  private lastExecutedTime = 0;
  private activeAction: IMouseAction | null = null;
  private hoveredTile: MiningPosition | null = null;
  private screenMousePos: Vector2D | null = null;

  private hoverListeners: Set<(tile: MiningPosition | null) => void> = new Set();
  private actionListeners: Set<(action: IMouseAction, target: MiningPosition, success: boolean) => void> = new Set();
  private miningListeners: Set<(isMining: boolean, target: MiningPosition | null) => void> = new Set();

  constructor(options?: MouseControllerOptions) {
    this.tileSize = options?.tileSize ?? TILE_SIZE;
  }

  /**
   * Bind DOM mouse events to the canvas element.
   */
  public attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.detach();

    this.canvas = canvas;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('blur', this.handleBlur);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  /**
   * Clean up event listeners.
   */
  public detach(): void {
    if (!this.canvas) return;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas = null;
    this.hoveredTile = null;
    this.screenMousePos = null;
    this.lastExecutedTarget = null;
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.notifyMiningListeners(false, null);
    }
    this.notifyHoverListeners();
  }

  public setCamera(camera: Camera2D | null): void {
    this.camera = camera;
  }

  public setPlayerPosition(pos: Vector2D): void {
    this.playerPos = { x: pos.x, y: pos.y };
  }

  public setGrid(grid: MiningClientTile[][]): void {
    this.grid = grid;
  }

  public setActiveAction(action: IMouseAction | null): void {
    const isSameAction =
      (!this.activeAction && !action) ||
      (this.activeAction &&
        action &&
        this.activeAction.name === action.name &&
        this.activeAction.triggerMode === action.triggerMode);

    if (isSameAction) {
      this.activeAction = action;
      return;
    }

    this.activeAction = action;
    this.lastExecutedTarget = null;
    // If switching or clearing active action while mouse was pressed down,
    // reset isMouseDown to prevent accidental actions or runaway mining.
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.notifyMiningListeners(false, null);
    }
  }

  public getActiveAction(): IMouseAction | null {
    return this.activeAction;
  }

  public getHoveredTile(): MiningPosition | null {
    return this.hoveredTile ? { ...this.hoveredTile } : null;
  }

  public getScreenMousePosition(): Vector2D | null {
    return this.screenMousePos ? { ...this.screenMousePos } : null;
  }

  public getIsMouseDown(): boolean {
    return this.isMouseDown;
  }

  /**
   * Converts current screen mouse position to world pixel coordinates using Camera2D.
   */
  public getWorldMousePosition(): Vector2D | null {
    if (!this.camera || !this.canvas || !this.screenMousePos) return null;
    const rect = this.canvas.getBoundingClientRect();
    const relativeX = this.screenMousePos.x - rect.left;
    const relativeY = this.screenMousePos.y - rect.top;
    return this.camera.screenToWorld({ x: relativeX, y: relativeY });
  }

  /**
   * Converts screen pixel coordinates on canvas to mining grid tile coordinates.
   */
  public screenToGridTile(screenX: number, screenY: number): MiningPosition | null {
    if (!this.camera || !this.canvas) return null;

    const rect = this.canvas.getBoundingClientRect();
    const relativeX = screenX - rect.left;
    const relativeY = screenY - rect.top;

    const worldPos = this.camera.screenToWorld({ x: relativeX, y: relativeY });
    const tileX = Math.floor(worldPos.x / this.tileSize);
    const tileY = Math.floor(worldPos.y / this.tileSize);

    // Boundary check
    if (tileY < 0 || tileY >= this.grid.length || tileX < 0 || tileX >= (this.grid[0]?.length || 0)) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  /**
   * Checks if a target tile is within reach (cardinal or diagonal).
   */
  public isWithinReach(target: MiningPosition): boolean {
    const tileCenterX = target.x + 0.5;
    const tileCenterY = target.y + 0.5;
    const dx = Math.abs(tileCenterX - this.playerPos.x);
    const dy = Math.abs(tileCenterY - this.playerPos.y);
    return dx <= MINING_CONFIG.PLAYER_MINING_REACH && dy <= MINING_CONFIG.PLAYER_MINING_REACH;
  }

  /**
   * Computes current visual reticle state for rendering overlay indicators.
   */
  public getReticleState(): {
    active: boolean;
    target: MiningPosition | null;
    style: ReticleStyle | null;
  } {
    if (!this.hoveredTile) {
      return { active: false, target: null, style: null };
    }

    if (this.activeAction) {
      const style = this.activeAction.getReticleStyle(this.hoveredTile, this.playerPos, this.grid);
      return {
        active: true,
        target: this.hoveredTile,
        style,
      };
    }

    // Default Mining Reticle
    const inReach = this.isWithinReach(this.hoveredTile);
    const tile =
      this.hoveredTile.y >= 0 &&
      this.hoveredTile.y < this.grid.length &&
      this.hoveredTile.x >= 0 &&
      this.hoveredTile.x < (this.grid[0]?.length || 0)
        ? this.grid[this.hoveredTile.y][this.hoveredTile.x]
        : null;

    const isMinable = tile ? isTileMineable(tile.type) : false;
    const isRock = tile && tile.type === MiningTileType.ROCK;

    if (isMinable) {
      if (inReach) {
        return {
          active: true,
          target: this.hoveredTile,
          style: {
            color: this.isMouseDown ? 0xf59e0b : 0xeab308,
            alpha: this.isMouseDown ? 0.35 : 0.2,
            strokeColor: this.isMouseDown ? 0xfbbf24 : 0xfde047,
            isValid: true,
            showPreview: false,
          },
        };
      } else {
        return {
          active: true,
          target: this.hoveredTile,
          style: {
            color: 0xef4444,
            alpha: 0.15,
            strokeColor: 0xf87171,
            isValid: false,
            showPreview: false,
          },
        };
      }
    }

    if (isRock) {
      return {
        active: true,
        target: this.hoveredTile,
        style: {
          color: 0x475569,
          alpha: 0.2,
          strokeColor: 0x64748b,
          isValid: false,
          showPreview: false,
        },
      };
    }

    // Default inspection reticle for other tiles
    return {
      active: true,
      target: this.hoveredTile,
      style: {
        color: inReach ? 0x64748b : 0x334155,
        alpha: 0.1,
        strokeColor: inReach ? 0x94a3b8 : 0x475569,
        isValid: inReach,
        showPreview: false,
      },
    };
  }

  public onHoverChange(callback: (tile: MiningPosition | null) => void): () => void {
    this.hoverListeners.add(callback);
    return () => this.hoverListeners.delete(callback);
  }

  public onActionExecuted(
    callback: (action: IMouseAction, target: MiningPosition, success: boolean) => void
  ): () => void {
    this.actionListeners.add(callback);
    return () => this.actionListeners.delete(callback);
  }

  public onMiningStateChange(
    callback: (isMining: boolean, target: MiningPosition | null) => void
  ): () => void {
    this.miningListeners.add(callback);
    return () => this.miningListeners.delete(callback);
  }

  /**
   * Re-evaluates what is under the mouse cursor using the current screen mouse position
   * and camera projection. Should be called each frame so that as the camera/player moves,
   * the hovered tile and mining target update continuously even if the mouse is stationary.
   */
  public update(): void {
    if (!this.screenMousePos || !this.camera || !this.canvas) return;

    const tile = this.screenToGridTile(this.screenMousePos.x, this.screenMousePos.y);

    const prevTile = this.hoveredTile;
    const isDifferent =
      (!prevTile && tile) ||
      (prevTile && !tile) ||
      (prevTile && tile && (prevTile.x !== tile.x || prevTile.y !== tile.y));

    if (isDifferent) {
      this.hoveredTile = tile;
      this.notifyHoverListeners();

      // If mouse is held down and in default mining mode, update target
      if (this.isMouseDown && !this.activeAction) {
        this.notifyMiningListeners(true, tile);
      }
    }

    // Continuous execution for actions with HOLD trigger mode (e.g. Ladder placement)
    if (this.isMouseDown && this.activeAction?.triggerMode === MouseActionTriggerMode.HOLD && tile) {
      this.tryExecuteActiveAction(tile);
    }
  }

  private handlePointerMove = (e: PointerEvent): void => {
    this.screenMousePos = { x: e.clientX, y: e.clientY };
    this.update();
  };

  private handlePointerDown = async (e: PointerEvent): Promise<void> => {
    // Only handle primary button (left click)
    if (e.button !== 0) return;

    // Check if the click target is an interactive UI element (button, input, modal)
    const targetEl =
      e.target && typeof (e.target as any).closest === 'function' ? (e.target as HTMLElement) : null;
    if (
      targetEl &&
      (targetEl.closest('button') ||
        targetEl.closest('.pointer-events-auto') ||
        targetEl.tagName === 'BUTTON' ||
        targetEl.tagName === 'INPUT')
    ) {
      return;
    }

    this.isMouseDown = true;
    this.screenMousePos = { x: e.clientX, y: e.clientY };
    const tile = this.screenToGridTile(e.clientX, e.clientY) || this.hoveredTile;
    this.hoveredTile = tile;
    this.lastExecutedTarget = null;

    if (this.activeAction) {
      if (tile) {
        await this.tryExecuteActiveAction(tile);
      }
      return;
    }

    // Default left-click action is Mining
    this.notifyMiningListeners(true, tile);
  };

  private async tryExecuteActiveAction(target: MiningPosition): Promise<boolean> {
    if (!this.activeAction || this.isExecutingAction) return false;

    const now = performance.now();
    if (this.activeAction.cooldownMs && now - this.lastExecutedTime < this.activeAction.cooldownMs) {
      return false;
    }

    // Avoid duplicate execution on the exact same tile while held
    if (
      this.lastExecutedTarget &&
      this.lastExecutedTarget.x === target.x &&
      this.lastExecutedTarget.y === target.y
    ) {
      return false;
    }

    const canDo = this.activeAction.canExecute(target, this.playerPos, this.grid);
    if (!canDo) {
      // For single-click actions, notify listeners of invalid attempt
      if (this.activeAction.triggerMode === MouseActionTriggerMode.SINGLE) {
        this.notifyActionListeners(this.activeAction, target, false);
      }
      return false;
    }

    this.isExecutingAction = true;
    this.lastExecutedTarget = { ...target };
    this.lastExecutedTime = now;

    try {
      const success = await this.activeAction.execute(target, this.playerPos);
      this.notifyActionListeners(this.activeAction, target, success);
      return success;
    } catch (err) {
      console.error('[Mining Mouse] Action execution error:', err);
      this.notifyActionListeners(this.activeAction, target, false);
      return false;
    } finally {
      this.isExecutingAction = false;
    }
  }

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.lastExecutedTarget = null;
      if (!this.activeAction) {
        this.notifyMiningListeners(false, null);
      }
    }
  };

  private handleBlur = (): void => {
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.lastExecutedTarget = null;
      if (!this.activeAction) {
        this.notifyMiningListeners(false, null);
      }
    }
  };

  private handlePointerLeave = (): void => {
    this.hoveredTile = null;
    this.screenMousePos = null;
    if (this.isMouseDown) {
      this.isMouseDown = false;
      this.lastExecutedTarget = null;
      if (!this.activeAction) {
        this.notifyMiningListeners(false, null);
      }
    }
    this.notifyHoverListeners();
  };

  private notifyHoverListeners(): void {
    const tileCopy = this.hoveredTile ? { ...this.hoveredTile } : null;
    this.hoverListeners.forEach((cb) => cb(tileCopy));
  }

  private notifyActionListeners(action: IMouseAction, target: MiningPosition, success: boolean): void {
    this.actionListeners.forEach((cb) => cb(action, target, success));
  }

  private notifyMiningListeners(isMining: boolean, target: MiningPosition | null): void {
    const targetCopy = target ? { ...target } : null;
    this.miningListeners.forEach((cb) => cb(isMining, targetCopy));
  }

  public destroy(): void {
    this.detach();
    this.hoverListeners.clear();
    this.actionListeners.clear();
    this.miningListeners.clear();
    this.activeAction = null;
  }
}
