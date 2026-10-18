import { BLOCK_SCALE, MINING_CONFIG, isTileMineable, isTileSolid, isWithinMiningReach, type MiningPosition, type MiningTileType, type Vector2D } from '../types/mining';

/** How many blocks a pickaxe lines up at once: one original block's worth, so a character-sized tunnel opens in one sweep. */
export const MINING_QUEUE_LENGTH = BLOCK_SCALE;

/** The part of a tile the targeting reads; both the server's and the client's tiles fit. */
export interface TargetableTile {
  type: MiningTileType;
  revealed: boolean;
}

export interface MiningTargetOptions {
  /** Ctrl held: only the block under the cursor. */
  precise?: boolean;
  /** Blocks lined up at once; defaults to MINING_QUEUE_LENGTH. */
  count?: number;
  /** Reach in blocks, measured per axis from the player's centre like every other reach check. */
  reach?: number;
  /** The block being mined now; it stays first while it is still among the blocks lined up, so the pick does not flicker. */
  keep?: MiningPosition | null;
}

const inReach = (cell: MiningPosition, from: Vector2D, reach: number) =>
  isWithinMiningReach(cell.x + 0.5 - from.x, cell.y + 0.5 - from.y, reach);

const tileAt = (grid: TargetableTile[][], x: number, y: number): TargetableTile | undefined => grid[y]?.[x];

/** How far from the aiming line a block may sit and still be lined up: the neighbours across the line, one block either side. */
const SIDE_REACH = 1.6;
/** A block this close to the player (along the aim) is beside them, not in front. */
const MIN_AHEAD = 0.5;
/** Blocks whose distance along the aim differs by less than this are one layer of the face (they are mined nearest the cursor first). */
const LAYER_DEPTH = 0.75;

/** Points inside a block, as offsets from its middle, that count as seeing it: the middle and four spots toward its corners. */
const SIGHT_POINTS: readonly [number, number][] = [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];

/**
 * Whether the player (at `from`) can see `cell` without another block in the way. A block behind another block is
 * never mined until the one in front is gone. Seeing any one of a few points inside the block is enough, so a block
 * beside the one you face (just past its corner) counts as seen rather than being hidden by a grazing line.
 */
function isExposed(grid: TargetableTile[][], from: Vector2D, cell: MiningPosition): boolean {
  return SIGHT_POINTS.some(([ox, oy]) => lineIsClear(grid, from, cell, cell.x + 0.5 + ox, cell.y + 0.5 + oy));
}

/** Whether every cell the straight line from `from` to (tx, ty) crosses before reaching `cell` is revealed and not solid. */
function lineIsClear(grid: TargetableTile[][], from: Vector2D, cell: MiningPosition, tx: number, ty: number): boolean {
  const length = Math.hypot(tx - from.x, ty - from.y);
  if (length < 1e-6) return true;
  const dirX = (tx - from.x) / length;
  const dirY = (ty - from.y) / length;
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const deltaX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  let maxX = dirX === 0 ? Infinity : ((dirX > 0 ? x + 1 : x) - from.x) / dirX;
  let maxY = dirY === 0 ? Infinity : ((dirY > 0 ? y + 1 : y) - from.y) / dirY;
  for (let guard = 0; guard < 4 * (Math.ceil(length) + 2); guard++) {
    if (x === cell.x && y === cell.y) return true;
    const tile = tileAt(grid, x, y);
    if (!tile || !tile.revealed || isTileSolid(tile.type)) return false;
    if (maxX < maxY) {
      x += stepX;
      maxX += deltaX;
    } else {
      y += stepY;
      maxY += deltaY;
    }
  }
  return false;
}

/**
 * The blocks a pickaxe lines up when the player (at `from`) aims toward the `cursor` cell, in the order they
 * should be mined. It works by direction, like Terraria's smart cursor, so the player can walk and dig without
 * steering the cursor to each block.
 *
 * The candidates are the mineable blocks near the line from the player toward the cursor (the line itself and the
 * blocks one either side of it), within reach, that the player can see and hit directly: no block is chosen from
 * behind another. That is the face of whatever is in the way, so a cursor over a far or hidden block mines the
 * blocks in front of it first. The face is mined nearest the player first and, among blocks equally near, nearest
 * the cursor first; when the face is gone the next one becomes the front, and the process repeats.
 *
 * With `precise` (Ctrl) it is just the cursor cell, if it can be mined and is within reach.
 *
 * The server and the client both call this, so what the reticle shows is what will be mined.
 */
export function selectMiningTargets(
  grid: TargetableTile[][],
  from: Vector2D,
  cursor: MiningPosition,
  options: MiningTargetOptions = {}
): MiningPosition[] {
  const reach = options.reach ?? MINING_CONFIG.PLAYER_MINING_REACH;
  const count = options.count ?? MINING_QUEUE_LENGTH;

  const cursorTile = tileAt(grid, cursor.x, cursor.y);
  const cursorOnly = (): MiningPosition[] =>
    cursorTile && isTileMineable(cursorTile.type) && inReach(cursor, from, reach) ? [{ x: cursor.x, y: cursor.y }] : [];

  const targetX = cursor.x + 0.5;
  const targetY = cursor.y + 0.5;
  const length = Math.hypot(targetX - from.x, targetY - from.y);
  if (options.precise || length < 1e-6) return cursorOnly();

  const dirX = (targetX - from.x) / length;
  const dirY = (targetY - from.y) / length;
  // How far along the aim reach extends, and the point standing in for the cursor when it is further
  const aimEnd = reach;
  const refDistance = Math.min(length, aimEnd);
  const refX = from.x + dirX * refDistance;
  const refY = from.y + dirY * refDistance;

  const span = Math.ceil(aimEnd) + 2;
  const x0 = Math.floor(from.x) - span;
  const x1 = Math.floor(from.x) + span;
  const y0 = Math.floor(from.y) - span;
  const y1 = Math.floor(from.y) + span;

  const candidates: { cell: MiningPosition; ahead: number; toCursor: number; toPlayer: number }[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = tileAt(grid, x, y);
      if (!tile || !tile.revealed || !isTileMineable(tile.type)) continue;
      const cell = { x, y };
      if (!inReach(cell, from, reach)) continue;
      const relX = x + 0.5 - from.x;
      const relY = y + 0.5 - from.y;
      const ahead = relX * dirX + relY * dirY;
      const side = Math.abs(relX * dirY - relY * dirX);
      if (ahead < MIN_AHEAD || ahead > aimEnd + 1 || side > SIDE_REACH) continue;
      if (!isExposed(grid, from, cell)) continue;
      candidates.push({ cell, ahead, toCursor: Math.hypot(x + 0.5 - refX, y + 0.5 - refY), toPlayer: Math.hypot(relX, relY) });
    }
  }

  // Breadth first: the blocks nearest the player go before any further out, so a far cursor widens the tunnel
  // face by face instead of boring a one-block hole toward it. Within a layer the block nearest the cursor
  // goes first; ties go to the upper then the left block, so a wall mines middle, top, bottom.
  const byDepth = [...candidates].sort((a, b) => a.ahead - b.ahead);
  const ordered: MiningPosition[] = [];
  while (byDepth.length > 0 && ordered.length < count) {
    const layerEnd = byDepth[0].ahead + LAYER_DEPTH;
    const layer = byDepth.filter((c) => c.ahead <= layerEnd);
    layer.sort((a, b) => a.toCursor - b.toCursor || a.toPlayer - b.toPlayer || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    for (const c of layer) {
      ordered.push(c.cell);
      byDepth.splice(byDepth.indexOf(c), 1);
    }
  }
  const chosen = ordered.slice(0, count);
  const keep = options.keep;
  if (keep) {
    const at = chosen.findIndex((c) => c.x === keep.x && c.y === keep.y);
    if (at > 0) chosen.unshift(...chosen.splice(at, 1));
  }
  return chosen;
}
