import { doodadRect, doodadSizeChoices, type DoodadDefinition, type DoodadPlacement, type SandboxMobOption } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';
import { SANDBOX_BLOCK_SCALE, SANDBOX_HALL_OLD } from './SandboxLayout';
import { doodadPlacementProblem } from './sandboxDoodads';

/**
 * Named test scenes for the doodads (ticket 107, like the fluid and extractor scenes): each one clears the scenery and
 * lays out the room's real doodad kinds in the sandbox's long hall, so a bug with one kind, one anchor or one behaviour can
 * be reproduced from the same starting point every time. A scene places only through the room's own doodad subsystem, and
 * every doodad is checked the way a hand-placed one is (open footprint, solid anchor edge).
 */
export interface DoodadScene {
  id: string;
  name: string;
  description: string;
  apply(engine: MiningGameEngine, characterId: string): { ok: true; placed: number } | { ok: false; error: string };
}

/** What a scene lays out: which kinds, how many of each, and how far apart. */
interface Layout {
  filter: (doodad: DoodadDefinition) => boolean;
  /** Copies of each kind and size. */
  copies: number;
  /** Open cells between two doodads in a row. */
  gap: number;
}

/** The hall in cells of the whole map: its open rows and columns (walls and floor are one cell beyond). */
function hallOf(engine: MiningGameEngine) {
  const S = SANDBOX_BLOCK_SCALE;
  return {
    x0: SANDBOX_HALL_OLD.x0 * S,
    x1: (SANDBOX_HALL_OLD.x1 + 1) * S - 1,
    y0: engine.surfaceRow + SANDBOX_HALL_OLD.y0 * S,
    y1: engine.surfaceRow + (SANDBOX_HALL_OLD.y1 + 1) * S - 1,
  };
}

/** Where rows start along the hall: past the ladder shaft that opens into its ceiling (original blocks 12-14). */
const ROW_START_X = 17 * SANDBOX_BLOCK_SCALE;

function clearDoodads(engine: MiningGameEngine): void {
  for (const p of engine.doodadSubsystem.placements()) engine.doodadSubsystem.removeAt(p.x, p.y);
}

/**
 * Lays the kinds the filter picks along the hall: floor and ceiling in rows, air doodads at mid-height, wall doodads stacked
 * down the left wall and then the right one. Everything that does not fit is skipped. Returns how many were placed and where the
 * floor row starts (where the player is put).
 */
function layOut(engine: MiningGameEngine, layout: Layout): { placed: number; startX: number } {
  const sub = engine.doodadSubsystem;
  const hall = hallOf(engine);
  const cursors = { FLOOR: ROW_START_X, CEILING: ROW_START_X, AIR: ROW_START_X, leftWallY: hall.y0, rightWallY: hall.y0 };
  let placed = 0;
  sub.definitions.forEach((def, typeIndex) => {
    if (!layout.filter(def)) return;
    doodadSizeChoices(def).forEach((_, variant) => {
      for (let copy = 0; copy < layout.copies; copy++) {
        let placement: DoodadPlacement;
        const size = doodadRect(def, { x: 0, y: 0, variant });
        switch (def.anchor) {
          case 'FLOOR':
            placement = { typeIndex, x: cursors.FLOOR, y: hall.y1 - size.height + 1, variant, flip: false };
            break;
          case 'CEILING':
            placement = { typeIndex, x: cursors.CEILING, y: hall.y0, variant, flip: false };
            break;
          case 'AIR':
            placement = { typeIndex, x: cursors.AIR, y: hall.y0 + Math.floor((hall.y1 - hall.y0 - size.height) / 2), variant, flip: false };
            break;
          default: {
            // WALL: the left wall first, then the right one when the left is full
            const left = cursors.leftWallY + size.height - 1 <= hall.y1;
            if (!left && cursors.rightWallY + size.height - 1 > hall.y1) return;
            placement = left
              ? { typeIndex, x: hall.x0, y: cursors.leftWallY, variant, flip: false }
              : { typeIndex, x: hall.x1 - size.width + 1, y: cursors.rightWallY, variant, flip: true };
          }
        }
        if (placement.x + size.width - 1 > hall.x1) return;
        if (doodadPlacementProblem(engine.grid, def, placement) !== null || !sub.add(placement)) return;
        placed++;
        if (def.anchor === 'WALL') {
          if (!placement.flip) cursors.leftWallY += size.height + 1;
          else cursors.rightWallY += size.height + 1;
        } else {
          cursors[def.anchor as 'FLOOR' | 'CEILING' | 'AIR'] += size.width + layout.gap;
        }
      }
    });
  });
  return { placed, startX: ROW_START_X };
}

/** Clears the scenery, lays a scene out, and puts the player on the hall floor just before the floor row. */
function runScene(engine: MiningGameEngine, characterId: string, layout: Layout, what: string): { ok: true; placed: number } | { ok: false; error: string } {
  if (engine.doodadSubsystem.definitions.length === 0) return { ok: false, error: 'There are no doodads defined to show.' };
  clearDoodads(engine);
  const { placed, startX } = layOut(engine, layout);
  if (placed === 0) {
    return { ok: false, error: `No ${what} doodads are defined (or none of them fit in the hall).` };
  }
  const hall = hallOf(engine);
  const body = engine.getPlayer(characterId)?.playerBody;
  if (body) {
    body.position = { x: startX - 4, y: hall.y1 - 2 };
    body.velocity = { x: 0, y: 0 };
  }
  return { ok: true, placed };
}

export const DOODAD_SCENES: readonly DoodadScene[] = [
  {
    id: 'floor-row',
    name: 'Floor row',
    description: 'Every floor doodad, in every size, in a row on the hall floor.',
    apply: (engine, id) => runScene(engine, id, { filter: (d) => d.anchor === 'FLOOR', copies: 1, gap: 3 }, 'floor'),
  },
  {
    id: 'ceiling-row',
    name: 'Ceiling row',
    description: 'Every ceiling doodad, in every size, hanging in a row from the hall ceiling.',
    apply: (engine, id) => runScene(engine, id, { filter: (d) => d.anchor === 'CEILING', copies: 1, gap: 3 }, 'ceiling'),
  },
  {
    id: 'walls',
    name: 'Walls',
    description: 'Every wall doodad, stacked down the hall walls (left first, then right, mirrored).',
    apply: (engine, id) => runScene(engine, id, { filter: (d) => d.anchor === 'WALL', copies: 1, gap: 0 }, 'wall'),
  },
  {
    id: 'bug-field',
    name: 'Bug field',
    description: 'Four of every doodad that wanders (crawlers, hoppers and flutterers). Walk up to them to scare them.',
    apply: (engine, id) => runScene(engine, id, { filter: (d) => d.wander != null, copies: 4, gap: 4 }, 'wandering'),
  },
  {
    id: 'reaction-lane',
    name: 'Reaction lane',
    description: 'Every floor doodad that reacts to bodies, packed close together. Walk (and run) through them.',
    apply: (engine, id) => runScene(engine, id, { filter: (d) => d.anchor === 'FLOOR' && d.reacts != null, copies: 3, gap: 0 }, 'reacting floor'),
  },
  {
    id: 'everything',
    name: 'Everything',
    description: 'One of every doodad kind and size: floor and ceiling rows, air doodads, and the walls.',
    apply: (engine, id) => runScene(engine, id, { filter: () => true, copies: 1, gap: 3 }, ''),
  },
];

export const DOODAD_SCENE_OPTIONS: readonly SandboxMobOption[] = DOODAD_SCENES.map((scene) => ({ id: scene.id, name: scene.name }));

export const findDoodadScene = (id: unknown): DoodadScene | undefined => DOODAD_SCENES.find((scene) => scene.id === id);
