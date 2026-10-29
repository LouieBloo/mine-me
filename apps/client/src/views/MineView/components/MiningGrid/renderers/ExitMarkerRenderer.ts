import { Container, Graphics, Text } from 'pixi.js';
import { MINING_CONFIG } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

/** Where the extraction point is drawn, in pixels of the grid: the sign's foot (middle of the spot, on the ground) and the width of the spot. */
export interface ExitMarkerPlacement {
  footX: number;
  footY: number;
  /** Width of the area in which standing counts as being at the exit. */
  zoneWidth: number;
}

/** The sign stands on the ground row `surfaceRow`, in the middle of the spot where leaving is allowed (see `isOnEntrance`). */
export function exitMarkerPlacement(surfaceRow: number, tileSize: number = TILE_SIZE): ExitMarkerPlacement {
  const radius = MINING_CONFIG.ENTRANCE_EXIT_RADIUS;
  return {
    footX: (MINING_CONFIG.ENTRANCE_X + 0.5) * tileSize,
    footY: (surfaceRow + MINING_CONFIG.ENTRANCE_Y) * tileSize,
    zoneWidth: (radius * 2 + 1) * tileSize,
  };
}

const POST_COLOR = 0x78350f;
const BOARD_COLOR = 0x047857;
const BOARD_EDGE = 0xd1fae5;
const ZONE_COLOR = 0x34d399;

/**
 * The extraction point's sign (placeholder art drawn with Graphics until there is a picture): a post with a green EXIT board
 * and an arrow, over a faint strip on the ground showing how wide the spot is. It stands behind every body, so it never
 * hides the character, and it is the only way to leave the mine, so it must be easy to spot.
 */
export class ExitMarkerRenderer {
  public readonly root = new Container();

  constructor(parent: Container, surfaceRow: number, tileSize: number = TILE_SIZE) {
    const { footX, footY, zoneWidth } = exitMarkerPlacement(surfaceRow, tileSize);
    this.root.label = 'exit-marker';

    // The ground strip: where standing counts as being at the exit
    const zone = new Graphics();
    zone.rect(footX - zoneWidth / 2, footY - tileSize * 0.3, zoneWidth, tileSize * 0.3).fill({ color: ZONE_COLOR, alpha: 0.35 });
    zone.rect(footX - zoneWidth / 2, footY - tileSize * 0.3, zoneWidth, tileSize * 0.3).stroke({ color: ZONE_COLOR, alpha: 0.8, width: 1 });
    this.root.addChild(zone);

    // The post and the board, standing on the ground
    const postHeight = tileSize * 2.6;
    const boardWidth = tileSize * 3.6;
    const boardHeight = tileSize * 1.3;
    const boardTop = footY - postHeight - boardHeight * 0.4;
    const sign = new Graphics();
    sign.rect(footX - tileSize * 0.2, footY - postHeight, tileSize * 0.4, postHeight).fill(POST_COLOR);
    sign.roundRect(footX - boardWidth / 2, boardTop, boardWidth, boardHeight, tileSize * 0.2).fill(BOARD_COLOR).stroke({ color: BOARD_EDGE, width: 2 });
    // An arrow pointing down at the spot
    const arrowTop = boardTop + boardHeight + tileSize * 0.15;
    sign.poly([footX - tileSize * 0.5, arrowTop, footX + tileSize * 0.5, arrowTop, footX, arrowTop + tileSize * 0.7]).fill(BOARD_EDGE);
    this.root.addChild(sign);

    const label = new Text({ text: 'EXIT', style: { fill: 0xffffff, fontSize: Math.round(tileSize * 0.9), fontWeight: '900', letterSpacing: 2 } });
    label.anchor.set(0.5);
    label.position.set(footX, boardTop + boardHeight / 2);
    this.root.addChild(label);

    parent.addChild(this.root);
  }

  public destroy(): void {
    this.root.destroy({ children: true });
  }
}
