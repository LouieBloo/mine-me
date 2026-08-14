import React, { useEffect, useRef, useState } from 'react';
import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import { usePixiStage } from '../../../../components/game/PixiStageContext/PixiStageContext';
import { CompositeEntitySprite, type GearLayerDescriptor } from '../../../../components/game/sprites/CompositeEntitySprite';
import type {
  MiningSessionClientState,
  PlayerState,
  MiningStateTickPayload,
  MiningInputState,
  Vector2D,
} from '@mine-me/shared';
import { MiningTileType, MINING_CONFIG, getAssetUrl } from '@mine-me/shared';
import { useSocket } from '../../../../contexts/SocketContext';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
}

const TILE_SIZE = 64;

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState: initialSessionState,
  playerState,
}) => {
  const { app } = usePixiStage();
  const { onEvent, sendGameEvent } = useSocket();

  const [sessionState, setSessionState] = useState<MiningSessionClientState>(initialSessionState);

  // References to Pixi containers and graphics
  const gridContainerRef = useRef<Container | null>(null);
  const tilesContainerRef = useRef<Container | null>(null);
  const droppedItemsContainerRef = useRef<Container | null>(null);
  const playerContainerRef = useRef<Container | null>(null);
  const tileGraphicsMap = useRef<Map<string, Graphics>>(new Map());
  const droppedSpritesMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const playerSpriteRef = useRef<CompositeEntitySprite | null>(null);
  const isFacingLeftRef = useRef<boolean>(false);

  // Floating point lerp position refs for 60+ FPS rendering
  const currentRenderPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });
  const targetServerPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });

  // Pressed keys tracking
  const keysPressedRef = useRef<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    miningKey: boolean;
    sequence: number;
  }>({
    up: false,
    down: false,
    left: false,
    right: false,
    miningKey: false,
    sequence: 0,
  });

  // Gear layers derivation
  const baseBodyUrl = getAssetUrl('/assets/gear/base-body.png');
  const gearLayers: GearLayerDescriptor[] = React.useMemo(() => {
    if (!playerState.inventory?.items) return [];
    return playerState.inventory.items
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => ({
        url: getAssetUrl(inv.item.gearImageUrl),
        subType: inv.item.subType as any,
      }));
  }, [playerState.inventory?.items]);

  // Subscribe to real-time 30 Hz server ticks
  useEffect(() => {
    const cleanup = onEvent('mining_state_tick', (payload: MiningStateTickPayload) => {
      targetServerPosRef.current = payload.position;

      setSessionState((prev) => {
        // Apply newly revealed tiles to our local grid copy
        let updatedGrid = prev.grid;
        if (payload.revealedTiles && payload.revealedTiles.length > 0) {
          updatedGrid = prev.grid.map((row) => row.map((tile) => ({ ...tile })));
          for (const rt of payload.revealedTiles) {
            if (updatedGrid[rt.y] && updatedGrid[rt.y][rt.x]) {
              updatedGrid[rt.y][rt.x] = {
                type: rt.type,
                revealed: true,
                damageStage: rt.damageStage ?? updatedGrid[rt.y][rt.x].damageStage,
              };
            }
          }
        }


        return {
          ...prev,
          grid: updatedGrid,
          position: {
            x: Math.round(payload.position.x),
            y: Math.round(payload.position.y),
          },
          temporaryBackpack: payload.temporaryBackpack,
          droppedItems: payload.droppedItems,
          isMining: payload.isMining,
          miningTarget: payload.miningTarget,
          miningTimeMs: payload.miningProgressMs,
        };
      });
    });

    return () => {
      cleanup();
    };
  }, [onEvent]);

  // Keyboard Event Handlers for Real-Time Continuous Input
  useEffect(() => {
    const updateInputState = (e: KeyboardEvent, isKeyDown: boolean) => {
      const key = e.key.toLowerCase();
      let changed = false;
      const current = keysPressedRef.current;

      if (key === 'w' || key === 'arrowup') {
        if (current.up !== isKeyDown) { current.up = isKeyDown; changed = true; }
      } else if (key === 's' || key === 'arrowdown') {
        if (current.down !== isKeyDown) { current.down = isKeyDown; changed = true; }
      } else if (key === 'a' || key === 'arrowleft') {
        if (current.left !== isKeyDown) { current.left = isKeyDown; changed = true; }
        if (isKeyDown) {
          isFacingLeftRef.current = true;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(true);
          }
        }
      } else if (key === 'd' || key === 'arrowright') {
        if (current.right !== isKeyDown) { current.right = isKeyDown; changed = true; }
        if (isKeyDown) {
          isFacingLeftRef.current = false;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(false);
          }
        }
      }

      if (changed) {
        current.sequence++;
        const payloadInput: MiningInputState = { ...current };
        sendGameEvent({ type: 'mining_input', input: payloadInput });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => updateInputState(e, true);
    const handleKeyUp = (e: KeyboardEvent) => updateInputState(e, false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [sendGameEvent]);

  const [containersReady, setContainersReady] = useState<boolean>(false);

  // Setup Pixi Containers
  useEffect(() => {
    if (!app) return;

    const gridContainer = new Container();
    const backgroundContainer = new Container();
    const tilesContainer = new Container();
    const droppedItemsContainer = new Container();
    const playerContainer = new Container();

    // Render background: Sky above ground (y <= 0), solid black underground (y > 0)
    const bgGraphics = new Graphics();
    const bgWidth = MINING_CONFIG.GRID_WIDTH * TILE_SIZE;
    const bgHeight = MINING_CONFIG.GRID_HEIGHT * TILE_SIZE;
    const skyHeight = 2000;
    const extraMargin = 2000;

    // Sky above ground (nice blue: #38bdf8 / 0x38bdf8 or sky-500 #0ea5e9 / 0x0ea5e9)
    bgGraphics.rect(-extraMargin, -skyHeight, bgWidth + extraMargin * 2, skyHeight);
    bgGraphics.fill(0x38bdf8);

    // Underground solid black (y >= 0)
    bgGraphics.rect(-extraMargin, 0, bgWidth + extraMargin * 2, bgHeight + extraMargin * 2);
    bgGraphics.fill(0x000000);

    backgroundContainer.addChild(bgGraphics);

    gridContainer.addChild(backgroundContainer);
    gridContainer.addChild(tilesContainer);
    gridContainer.addChild(droppedItemsContainer);
    gridContainer.addChild(playerContainer);
    app.stage.addChild(gridContainer);

    gridContainerRef.current = gridContainer;
    tilesContainerRef.current = tilesContainer;
    droppedItemsContainerRef.current = droppedItemsContainer;
    playerContainerRef.current = playerContainer;
    setContainersReady(true);

    // Create Composite Character Sprite
    const sprite = new CompositeEntitySprite(playerContainer, baseBodyUrl);
    playerSpriteRef.current = sprite;
    sprite.load().then(() => {
      // Scale sprite to fit within a single tile cell
      sprite.scaleToFit(TILE_SIZE);
      if (isFacingLeftRef.current) {
        sprite.setFlipped(true);
      }
      if (gearLayers.length > 0) {
        sprite.setGearLayers(gearLayers);
      }
    });

    return () => {
      setContainersReady(false);
      app.stage.removeChild(gridContainer);
      gridContainer.destroy({ children: true });
    };
  }, [app, baseBodyUrl, gearLayers]);

  // Render Grid Tiles & Dropped Items
  useEffect(() => {
    const tilesContainer = tilesContainerRef.current;
    if (!tilesContainer || !containersReady) return;

    sessionState.grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        const key = `${x},${y}`;
        let graphics = tileGraphicsMap.current.get(key);

        if (!graphics) {
          graphics = new Graphics();
          graphics.x = x * TILE_SIZE;
          graphics.y = y * TILE_SIZE;
          tilesContainer.addChild(graphics);
          tileGraphicsMap.current.set(key, graphics);
        }

        graphics.clear();
        if (!tile.revealed) {
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x000000);
        } else {
          switch (tile.type) {
            case MiningTileType.EMPTY:
              // Empty space shows background
              break;
            case MiningTileType.DIRT:
              graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
              graphics.fill(0x451a03);
              graphics.circle(16, 20, 2);
              graphics.circle(48, 12, 1.5);
              graphics.circle(32, 44, 2);
              graphics.fill(0x78350f);
              break;
            case MiningTileType.ROCK:
              graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
              graphics.fill(0x334155);
              break;
            case MiningTileType.MINERAL:
              graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
              graphics.fill(0x312e81);
              graphics.circle(20, 20, 3);
              graphics.circle(44, 24, 4);
              graphics.fill(0xf59e0b);
              break;
            case MiningTileType.CHEST:
              graphics.rect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
              graphics.fill(0xd97706);
              break;
            case MiningTileType.ENTRANCE:
              graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
              graphics.fill(0x064e3b);
              break;
          }

          // Render crack overlay if block is partially mined
          if (tile.damageStage && tile.damageStage > 0 && tile.type !== MiningTileType.EMPTY) {
            const c = TILE_SIZE / 2;
            const darkColor = 0x000000;
            if (tile.damageStage >= 1) {
              graphics.moveTo(c - 8, c - 10);
              graphics.lineTo(c + 2, c);
              graphics.lineTo(c - 4, c + 10);
              graphics.stroke({ width: 1.5, color: darkColor, alpha: 0.8 });
            }
            if (tile.damageStage >= 2) {
              graphics.moveTo(c + 10, c - 12);
              graphics.lineTo(c - 2, c);
              graphics.lineTo(c + 12, c + 8);
              graphics.stroke({ width: 2, color: darkColor, alpha: 0.85 });
            }
            if (tile.damageStage >= 3) {
              graphics.moveTo(c - 12, c - 4);
              graphics.lineTo(c + 12, c - 2);
              graphics.moveTo(c - 6, c + 12);
              graphics.lineTo(c + 8, c - 14);
              graphics.stroke({ width: 2.5, color: darkColor, alpha: 0.9 });
            }
            if (tile.damageStage >= 4) {
              graphics.rect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
              graphics.stroke({ width: 3, color: darkColor, alpha: 0.95 });
              graphics.moveTo(c - 14, c + 6);
              graphics.lineTo(c + 14, c - 8);
              graphics.stroke({ width: 3, color: darkColor, alpha: 1.0 });
            }
          }
        }
      });
    });
  }, [sessionState.grid, containersReady]);


  // Render Dropped Items
  useEffect(() => {
    const droppedItemsContainer = droppedItemsContainerRef.current;
    if (!droppedItemsContainer) return;

    const nextKeys = new Set<string>();

    sessionState.droppedItems.forEach((item, idx) => {
      const key = `${item.itemId}_${item.position.x}_${item.position.y}_${idx}`;
      nextKeys.add(key);

      if (!droppedSpritesMap.current.has(key)) {
        const itemX = item.position.x * TILE_SIZE + TILE_SIZE / 2;
        const itemY = item.position.y * TILE_SIZE + TILE_SIZE / 2;

        if (item.iconUrl) {
          const loadSprite = async () => {
            try {
              const texture = await Assets.load(getAssetUrl(item.iconUrl));
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              sprite.x = itemX;
              sprite.y = itemY;
              sprite.width = TILE_SIZE * 0.6;
              sprite.height = TILE_SIZE * 0.6;
              droppedItemsContainer.addChild(sprite);
              droppedSpritesMap.current.set(key, sprite);
            } catch {
              const fallback = new Graphics();
              fallback.x = itemX;
              fallback.y = itemY;
              fallback.circle(0, 0, 10);
              fallback.fill(0xf59e0b);
              droppedItemsContainer.addChild(fallback);
              droppedSpritesMap.current.set(key, fallback);
            }
          };
          loadSprite();
        }
      }
    });

    droppedSpritesMap.current.forEach((sprite, key) => {
      if (!nextKeys.has(key)) {
        droppedItemsContainer.removeChild(sprite);
        sprite.destroy();
        droppedSpritesMap.current.delete(key);
      }
    });
  }, [sessionState.droppedItems, containersReady]);

  // 60+ FPS PixiJS Frame Ticker — Linear Interpolation (lerp) & Smooth Camera Follow
  useEffect(() => {
    if (!app) return;

    const tickerCallback = () => {
      const playerContainer = playerContainerRef.current;
      const gridContainer = gridContainerRef.current;
      if (!playerContainer || !gridContainer) return;

      const currentPos = currentRenderPosRef.current;
      const targetPos = targetServerPosRef.current;

      // Linear interpolation (lerp) towards target server position
      const lerpSpeed = 0.25;
      const dx = targetPos.x - currentPos.x;
      if (Math.abs(dx) > 0.005) {
        const isMovingLeft = dx < 0;
        if (isFacingLeftRef.current !== isMovingLeft) {
          isFacingLeftRef.current = isMovingLeft;
          if (playerSpriteRef.current) {
            playerSpriteRef.current.setFlipped(isMovingLeft);
          }
        }
      }

      currentPos.x += dx * lerpSpeed;
      currentPos.y += (targetPos.y - currentPos.y) * lerpSpeed;

      // Position player sprite in pixel world space
      playerContainer.x = currentPos.x * TILE_SIZE;
      playerContainer.y = currentPos.y * TILE_SIZE;

      // Center camera view on player sprite
      const screenWidth = app.screen.width;
      const screenHeight = app.screen.height;
      gridContainer.x = screenWidth / 2 - (playerContainer.x + TILE_SIZE / 2);
      gridContainer.y = screenHeight / 2 - (playerContainer.y + TILE_SIZE / 2);
    };

    app.ticker.add(tickerCallback);
    return () => {
      app.ticker.remove(tickerCallback);
    };
  }, [app]);

  return <div className="mining-grid-container" />;
};
