import { FluidGrid } from './FluidGrid';
import { FluidRegistry, type FluidParams } from './FluidRegistry';
import { FluidField, toFluidWireCell } from './fluidWire';

/**
 * Small hand-built maps for watching and testing fluid. Characters:
 *  '#' solid rock, '.' air, 'H' ladder (open to fluid, like every non-solid tile),
 *  'w' a full cell of water, 'l' a full cell of lava, 'o' a full cell of oil, 'S' a spout that keeps pouring water into its cell.
 */
export interface FluidScene {
  key: string;
  name: string;
  /** What the scene shows (the case it reproduces). */
  description: string;
  rows: string[];
  /** Whether the spout starts pouring (a scene without a spout ignores this). */
  pours?: boolean;
  /** Rock cells ([x, y]) that can be mined out together, the way a gate opens (see `FluidSceneRunner.openGate`). */
  gate?: ReadonlyArray<readonly [number, number]>;
}

/** Water and lava as the game defines them (a mirror of the dev seed; the scenes only need the physics). */
export const SCENE_FLUIDS: readonly FluidParams[] = [
  { typeKey: 'LAVA', density: 3, viscosity: 0.85, flowRate: 0.06, minLevel: 0.05, flowThreshold: 0.03, reactions: [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }] },
  { typeKey: 'OIL', density: 0.8, viscosity: 0.6, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02 },
  { typeKey: 'WATER', density: 1, viscosity: 0.25, flowRate: 0.6, minLevel: 0.02, flowThreshold: 0.01 },
];

/** Fluid added per step by a spout (a fraction of a cell). */
export const SCENE_POUR_RATE = 0.5;

export const FLUID_SCENES: readonly FluidScene[] = [
  {
    key: 'tank',
    name: 'Tank with a spout',
    description: 'The default preview: a spout over a shelf, and a divider wall that can be opened.',
    pours: false,
    gate: [[12, 8], [12, 9], [12, 10]],
    rows: [
      '########################',
      '#.....S.....#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#....#####..#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '#...........#..........#',
      '########################',
    ],
  },
  {
    key: 'ledge-spill',
    name: 'Pool spilling off a ledge',
    description: 'A pool on a plateau runs over the edge and falls to a lower floor beside the cliff.',
    rows: [
      '################',
      '#..............#',
      '#..............#',
      '#..............#',
      '#wwwwww........#',
      '########.......#',
      '########.......#',
      '########.......#',
      '################',
    ],
  },
  {
    key: 'waterfall-pool',
    name: 'Waterfall into a pool',
    description: 'A steady pour from a spout falls through the air into a pool. The fall must be steady and the pool must not mound.',
    pours: true,
    rows: [
      '###############',
      '#......S......#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '###############',
    ],
  },
  {
    key: 'ladder-shaft',
    name: 'Spill down a ladder shaft',
    description: 'A plateau pool spills into a shaft with a ladder in it (ladders are open to fluid, like air).',
    rows: [
      '################',
      '#..............#',
      '#..............#',
      '#wwwwww.H......#',
      '########H#######',
      '########H#######',
      '########H#######',
      '#.......H......#',
      '################',
    ],
  },
  {
    key: 'cliff-trickle',
    name: 'Trickle down a cliff face',
    description: 'A pool runs off a plateau and down beside a cliff wall; it must not leave a stick along the wall or trickle forever.',
    rows: [
      '################',
      '#........#######',
      '#........#######',
      '#wwwww...#######',
      '######...#######',
      '######...#######',
      '######...#######',
      '######...#######',
      '################',
    ],
  },
  {
    key: 'u-bend',
    name: 'U-bend',
    description: 'Water poured into one arm of a U-shaped tunnel fills the low part and stops.',
    pours: true,
    rows: [
      '#########',
      '#S..#...#',
      '#...#...#',
      '#...#...#',
      '#.......#',
      '#########',
    ],
  },
  {
    key: 'lava-meets-water',
    name: 'Lava meets water',
    description: 'A lava pool and a water pool spread towards each other; where they meet the water hardens the lava into rock.',
    rows: [
      '################',
      '#..............#',
      '#..............#',
      '#llll...wwww...#',
      '################',
    ],
  },
  {
    key: 'one-wide-shaft',
    name: 'One-wide shaft',
    description: 'Water poured into a shaft one cell wide with walls on both sides.',
    pours: true,
    rows: [
      '#####',
      '##S##',
      '##.##',
      '##.##',
      '##.##',
      '##.##',
      '#...#',
      '#####',
    ],
  },
  {
    key: 'oil-spill',
    name: 'Oil spilled on the ground',
    description: 'A pocket of oil (six cells) lands on a flat floor and spreads. Thick oil is slow, but it must end as a flat, smooth layer.',
    rows: [
      '##################',
      '#................#',
      '#................#',
      '#................#',
      '#.....ooo........#',
      '#.....ooo........#',
      '##################',
    ],
  },
  {
    key: 'oil-on-water',
    name: 'Oil on water',
    description: 'Oil above a pool of water. A cell holds one fluid, so the oil rests on the water cell below it, with no gap between them.',
    rows: [
      '######################',
      '#....................#',
      '#....................#',
      '#......ooo...........#',
      '#......www...........#',
      '######################',
    ],
  },
  {
    key: 'mid-air-blob',
    name: 'Poured in mid-air',
    description: 'A single cell of water appears in open air and drops to the floor.',
    rows: [
      '###########',
      '#....w....#',
      '#.........#',
      '#.........#',
      '#.........#',
      '#.........#',
      '###########',
    ],
  },
];

export function fluidSceneByKey(key: string): FluidScene | undefined {
  return FLUID_SCENES.find((s) => s.key === key);
}

/** Whether a scene character is a tile fluid cannot enter. */
export const isSceneSolid = (c: string | undefined): boolean => c === '#' || c === undefined;

/**
 * A scene running on the real `FluidGrid`. Pure logic with no drawing, so tests and the admin preview share it.
 * Tiles can be mined (`openTile`), and cells the fluid reactions turn into blocks become solid rock.
 */
export class FluidSceneRunner {
  public readonly scene: FluidScene;
  public readonly width: number;
  public readonly height: number;
  public readonly registry: FluidRegistry;
  public readonly grid: FluidGrid;
  private readonly tiles: string[][];
  private readonly spouts: Array<{ x: number; y: number }> = [];
  public pouring: boolean;
  public gateOpen = false;
  public stepCount = 0;
  /** Fluid put in by spouts and the scene's starting cells, in cells of fluid (for conservation checks). */
  public poured = 0;

  constructor(scene: FluidScene, fluids: readonly FluidParams[] = SCENE_FLUIDS) {
    this.scene = scene;
    this.height = scene.rows.length;
    this.width = scene.rows[0].length;
    this.registry = new FluidRegistry(fluids);
    this.tiles = scene.rows.map((row) => row.split(''));
    this.grid = new FluidGrid(this.width, this.height, this.registry, (x, y) => isSceneSolid(this.tiles[y]?.[x]));
    this.pouring = scene.pours ?? false;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.tiles[y][x];
        const fluidKey = c === 'w' ? 'WATER' : c === 'l' ? 'LAVA' : c === 'o' ? 'OIL' : null;
        if (c === 'S') this.spouts.push({ x, y });
        if (fluidKey) {
          const id = this.registry.idOf(fluidKey);
          if (id !== undefined && this.grid.addFluid(x, y, id, 1)) this.poured += 1;
          this.tiles[y][x] = '.';
        }
      }
    }
  }

  public isSolid(x: number, y: number): boolean {
    return isSceneSolid(this.tiles[y]?.[x]);
  }

  /** The tile character at a cell ('#' solid, 'H' ladder, '.' open). */
  public tileAt(x: number, y: number): string {
    return this.tiles[y]?.[x] ?? '#';
  }

  /** Whether the scene has a spout to pour from. */
  public get hasSpout(): boolean {
    return this.spouts.length > 0;
  }

  /** Whether the scene has a gate that can be opened. */
  public get hasGate(): boolean {
    return (this.scene.gate?.length ?? 0) > 0;
  }

  /** Opens the scene's gate (mines out its rock cells), so the fluid pooled behind it runs through. */
  public openGate(): void {
    if (this.gateOpen) return;
    this.gateOpen = true;
    for (const [x, y] of this.scene.gate ?? []) this.openTile(x, y);
  }

  /** Mines a tile, the way breaking a block would, so the fluid beside it can flow. */
  public openTile(x: number, y: number): void {
    if (this.tiles[y]?.[x] !== '#') return;
    this.tiles[y][x] = '.';
    this.grid.onTileChanged(x, y);
  }

  /** One simulation step: spouts pour, the grid steps, and cells a reaction used up turn into rock. */
  public step(): void {
    if (this.pouring) {
      const water = this.registry.idOf('WATER');
      if (water !== undefined) {
        for (const s of this.spouts) {
          const room = Math.min(SCENE_POUR_RATE, 1 - this.grid.getLevel(s.x, s.y));
          if (room > 0 && this.grid.addFluid(s.x, s.y, water, room)) this.poured += room;
        }
      }
    }
    this.grid.step();
    this.stepCount++;
    for (const r of this.grid.takeReactions()) {
      this.tiles[r.y][r.x] = '#';
      this.grid.onTileChanged(r.x, r.y);
    }
  }

  public run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  /** Steps until nothing moves (and no lone film is left waiting to evaporate), with the spouts off. Returns the steps it took, or null if it never settled. */
  public settle(maxSteps = 3000): number | null {
    this.pouring = false;
    for (let n = 1; n <= maxSteps; n++) {
      this.step();
      if (this.grid.activeCount === 0 && this.grid.filmCount === 0) return n;
    }
    return null;
  }

  /** The fluid as a client would receive it, so drawing goes through the same code as the game. */
  public toField(): FluidField {
    const field = new FluidField(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const id = this.grid.getFluidId(x, y);
        if (id !== 0) field.apply([toFluidWireCell(x, y, id, this.grid.getLevel(x, y), this.grid.getFalling(x, y))]);
      }
    }
    return field;
  }

  /** The cells that currently hold fluid, as `[x, y]`. */
  public fluidCells(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.grid.getFluidId(x, y) !== 0) out.push([x, y]);
    return out;
  }
}
