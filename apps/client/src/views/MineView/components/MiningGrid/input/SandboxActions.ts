import { MouseActionTriggerMode, isTileSolid, type MiningClientTile, type MiningPosition, type Vector2D } from '@mine-me/shared';
import { BaseMouseAction, type ReticleStyle } from './MouseAction';

const inGrid = (grid: MiningClientTile[][], x: number, y: number): boolean =>
  y >= 0 && y < grid.length && x >= 0 && x < (grid[0]?.length ?? 0);

const toolReticle = (color: number, strokeColor: number, isValid: boolean): ReticleStyle => ({
  color: isValid ? color : 0xef4444,
  alpha: 0.3,
  strokeColor: isValid ? strokeColor : 0xf87171,
  isValid,
  showPreview: false,
});

/** Sandbox: pour the chosen fluid into the open tile under the cursor (hold to keep pouring). */
export class PourFluidAction extends BaseMouseAction {
  public readonly fluidKey: string;
  private readonly onPour: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(fluidKey: string, onPour: (target: MiningPosition) => Promise<boolean> | boolean) {
    super({ name: 'sandbox_pour_fluid', triggerMode: MouseActionTriggerMode.HOLD, cooldownMs: 60, clampsToGrid: true });
    this.fluidKey = fluidKey;
    this.onPour = onPour;
  }

  public canExecute(target: MiningPosition, _playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    if (!inGrid(grid, target.x, target.y)) return false;
    return !isTileSolid(grid[target.y][target.x].type);
  }

  public execute(target: MiningPosition): Promise<boolean> | boolean {
    return this.onPour(target);
  }

  public getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    return toolReticle(0x38bdf8, 0x7dd3fc, this.canExecute(target, playerPos, grid));
  }
}

/** Sandbox: spawn the chosen mob at the cursor (one per click, at the exact point). */
export class SpawnMobAction extends BaseMouseAction {
  public readonly mobId: string;
  private readonly onSpawn: (point: Vector2D) => Promise<boolean> | boolean;

  constructor(mobId: string, onSpawn: (point: Vector2D) => Promise<boolean> | boolean) {
    super({ name: 'sandbox_spawn_mob', triggerMode: MouseActionTriggerMode.SINGLE, isContinuous: true });
    this.mobId = mobId;
    this.onSpawn = onSpawn;
  }

  public canExecute(target: Vector2D, _playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    const x = Math.floor(target.x);
    const y = Math.floor(target.y);
    if (y < 0) return x >= 0 && x < (grid[0]?.length ?? 0); // open sky above the surface
    return inGrid(grid, x, y) && !isTileSolid(grid[y][x].type);
  }

  public execute(target: Vector2D): Promise<boolean> | boolean {
    return this.onSpawn(target);
  }

  public getReticleStyle(target: Vector2D, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    return { ...toolReticle(0x22c55e, 0x4ade80, this.canExecute(target, playerPos, grid)), isFreeAim: true };
  }
}

/** Sandbox: set the tile under the cursor alight (if it holds anything that burns). */
export class IgniteAction extends BaseMouseAction {
  private readonly onIgnite: (target: MiningPosition) => Promise<boolean> | boolean;

  constructor(onIgnite: (target: MiningPosition) => Promise<boolean> | boolean) {
    super({ name: 'sandbox_ignite', triggerMode: MouseActionTriggerMode.SINGLE, clampsToGrid: true });
    this.onIgnite = onIgnite;
  }

  public canExecute(target: MiningPosition, _playerPos: Vector2D, grid: MiningClientTile[][]): boolean {
    return inGrid(grid, target.x, target.y);
  }

  public execute(target: MiningPosition): Promise<boolean> | boolean {
    return this.onIgnite(target);
  }

  public getReticleStyle(target: MiningPosition, playerPos: Vector2D, grid: MiningClientTile[][]): ReticleStyle {
    return toolReticle(0xf97316, 0xfdba74, this.canExecute(target, playerPos, grid));
  }
}

/** Sandbox free camera: clicking does nothing (no mining, no shooting) while the camera is detached. */
export class FreeCameraAction extends BaseMouseAction {
  constructor() {
    super({ name: 'sandbox_free_camera', triggerMode: MouseActionTriggerMode.SINGLE });
  }

  public canExecute(): boolean {
    return false;
  }

  public execute(): boolean {
    return false;
  }

  public getReticleStyle(): ReticleStyle {
    return { color: 0x64748b, alpha: 0.08, strokeColor: 0x94a3b8, isValid: false, showPreview: false };
  }
}
