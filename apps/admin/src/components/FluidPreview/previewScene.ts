import {
  FLUID_SCENES, FluidSceneRunner, SCENE_FLUIDS, SCENE_POUR_RATE, fluidSceneByKey, type FluidField, type FluidParams, type FluidScene,
} from '@mine-me/shared';

/** The scene the preview opens with: the tank. */
export const DEFAULT_PREVIEW_SCENE = 'tank';
/** The size of the default scene (the tank). Other scenes have their own size: ask the scene. */
export const PREVIEW_WIDTH = 24;
export const PREVIEW_HEIGHT = 12;
/** Fluid added per simulation step while pouring (a fraction of a full cell). */
export const POUR_RATE = SCENE_POUR_RATE;

/** What the simulation needs from a fluid being edited. */
export type PreviewFluid = Pick<FluidParams, 'density' | 'flowRate'> & Partial<Pick<FluidParams, 'minLevel' | 'flowThreshold'>>;

/** The scenes the preview can show (see the shared fluid scenes). */
export const PREVIEW_SCENES: readonly FluidScene[] = FLUID_SCENES;

/**
 * A fluid scene running the real shared `FluidGrid` with the settings of the fluid being edited, so tuning flow rate in
 * the admin shows exactly what the game will do. The edited fluid is what the scene's water cells and spouts hold; a
 * scene with lava has the game's lava beside it. Pure logic with no drawing, so it can be tested without a canvas.
 */
export class PreviewScene {
  public readonly sceneKey: string;
  private readonly fluid: PreviewFluid;
  private runner: FluidSceneRunner;

  constructor(fluid: PreviewFluid, sceneKey: string = DEFAULT_PREVIEW_SCENE) {
    this.fluid = fluid;
    this.sceneKey = fluidSceneByKey(sceneKey) ? sceneKey : DEFAULT_PREVIEW_SCENE;
    this.runner = this.build();
  }

  private build(): FluidSceneRunner {
    const lava = SCENE_FLUIDS.filter((f) => f.typeKey !== 'WATER');
    return new FluidSceneRunner(fluidSceneByKey(this.sceneKey)!, [{ typeKey: 'WATER', ...this.fluid }, ...lava]);
  }

  public get scene(): FluidScene {
    return this.runner.scene;
  }

  public get width(): number {
    return this.runner.width;
  }

  public get height(): number {
    return this.runner.height;
  }

  /** The id of the fluid being edited in this scene's grid, and of the game's lava (when the scene has any). */
  public get fluidId(): number {
    return this.runner.registry.idOf('WATER') ?? 1;
  }

  public get lavaId(): number | undefined {
    return this.runner.registry.idOf('LAVA');
  }

  public get oilId(): number | undefined {
    return this.runner.registry.idOf('OIL');
  }

  public get pouring(): boolean {
    return this.runner.pouring;
  }

  public get dividerOpen(): boolean {
    return this.runner.gateOpen;
  }

  public get hasSpout(): boolean {
    return this.runner.hasSpout;
  }

  public get hasGate(): boolean {
    return this.runner.hasGate;
  }

  public isSolid(x: number, y: number): boolean {
    return this.runner.isSolid(x, y);
  }

  /** One simulation step (what the game does every few ticks). */
  public step(): void {
    this.runner.step();
  }

  public setPouring(pouring: boolean): void {
    this.runner.pouring = pouring && this.runner.hasSpout;
  }

  /** Takes out the scene's gate, the way mining a block would, so the fluid beside it can flow. */
  public openDivider(): void {
    this.runner.openGate();
  }

  /** Back to the scene's start. */
  public reset(): void {
    this.runner = this.build();
  }

  /** The fluid as a client would receive it, so the preview draws through the same code as the game. */
  public toField(): FluidField {
    return this.runner.toField();
  }

  public stats(): { volume: number; evaporated: number; activeCells: number } {
    return { volume: this.runner.grid.totalVolume(), evaporated: this.runner.grid.evaporatedVolume, activeCells: this.runner.grid.activeCount };
  }
}
