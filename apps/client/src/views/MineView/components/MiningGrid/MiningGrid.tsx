import React, { useEffect, useRef } from 'react';
import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import { usePixiStage } from '../../../../components/game/PixiStageContext/PixiStageContext';
import { CompositeEntitySprite, type GearLayerDescriptor } from '../../../../components/game/sprites/CompositeEntitySprite';
import type { MiningSessionClientState, MiningPosition, MiningDirection, PlayerState } from '@mine-me/shared';
import { MINING_CONFIG, MiningTileType, getAssetUrl } from '@mine-me/shared';
import { notificationService } from '../../../../services/notificationService';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onMove: (direction: MiningDirection) => Promise<void>;
  onMineStart: (position: MiningPosition) => Promise<void>;
  isProcessing: boolean;
}

const TILE_SIZE = 64;
const SLIDE_DURATION = 150; // ms to slide between tiles

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState,
  playerState,
  onMove,
  onMineStart,
  isProcessing,
}) => {
  const { app } = usePixiStage();

  // References to Pixi containers and sprites
  const gridContainerRef = useRef<Container | null>(null);
  const tilesContainerRef = useRef<Container | null>(null);
  const droppedItemsContainerRef = useRef<Container | null>(null);
  const playerContainerRef = useRef<Container | null>(null);
  const tileGraphicsMap = useRef<Map<string, Graphics>>(new Map());
  const droppedSpritesMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const playerSpriteRef = useRef<CompositeEntitySprite | null>(null);

  // Smooth sliding refs
  const isSlidingRef = useRef<boolean>(false);
  const slideStartTimeRef = useRef<number>(0);
  const slideStartXRef = useRef<number>(0);
  const slideStartYRef = useRef<number>(0);
  const slideTargetXRef = useRef<number>(0);
  const slideTargetYRef = useRef<number>(0);

  // Store references to handlers/props to avoid re-binding keyboard events
  const propsRef = useRef({ sessionState, onMove, onMineStart, isProcessing });
  useEffect(() => {
    propsRef.current = { sessionState, onMove, onMineStart, isProcessing };
  }, [sessionState, onMove, onMineStart, isProcessing]);

  // Derive player gear layers
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

  // Main setup and update effect
  const drawTile = (gridContainer: Container, x: number, y: number, tileType: MiningTileType, revealed: boolean) => {
    const key = `${x},${y}`;
    let graphics = tileGraphicsMap.current.get(key);

    if (!graphics) {
      graphics = new Graphics();
      graphics.x = x * TILE_SIZE;
      graphics.y = y * TILE_SIZE;
      gridContainer.addChild(graphics);
      tileGraphicsMap.current.set(key, graphics);
    }

    graphics.clear();

    if (!revealed) {
      // Fog of war
      graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.fill(0x020617); // slate-950
      graphics.stroke({ width: 0.5, color: 0x0f172a });
    } else {
      switch (tileType) {
        case MiningTileType.EMPTY:
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x0f172a); // slate-900 (walkable)
          graphics.stroke({ width: 0.5, color: 0x1e293b });
          break;
        case MiningTileType.DIRT:
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x451a03); // brown-900
          // Draw some dirt speckles
          graphics.circle(16, 20, 2);
          graphics.circle(48, 12, 1.5);
          graphics.circle(32, 44, 2);
          graphics.circle(12, 48, 1);
          graphics.fill(0x78350f); // brown-700
          graphics.stroke({ width: 0.5, color: 0x270e00 });
          break;
        case MiningTileType.ROCK:
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x334155); // slate-700
          // Draw some rock textures/cracks
          graphics.moveTo(5, 5);
          graphics.lineTo(25, 15);
          graphics.lineTo(40, 5);
          graphics.moveTo(10, 45);
          graphics.lineTo(35, 55);
          graphics.lineTo(55, 30);
          graphics.stroke({ width: 2, color: 0x1e293b });
          graphics.stroke({ width: 0.5, color: 0x475569 });
          break;
        case MiningTileType.MINERAL:
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x312e81); // indigo-950 rocky background
          // Sparkly minerals
          graphics.circle(20, 20, 3);
          graphics.circle(44, 24, 4);
          graphics.circle(28, 48, 3.5);
          graphics.fill(0xf59e0b); // amber-500 gold sparkles
          graphics.circle(44, 44, 2);
          graphics.circle(12, 36, 3);
          graphics.fill(0x3b82f6); // blue-500 mana mineral sparkles
          graphics.stroke({ width: 0.5, color: 0x1e1b4b });
          break;
        case MiningTileType.CHEST:
          // Golden treasure chest container
          graphics.rect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
          graphics.fill(0xd97706); // amber-600
          graphics.rect(12, 4, TILE_SIZE - 24, TILE_SIZE - 8);
          graphics.fill(0x451a03); // brown bands
          graphics.rect(TILE_SIZE / 2 - 4, TILE_SIZE / 2 - 4, 8, 8);
          graphics.fill(0xf59e0b); // gold lock
          graphics.stroke({ width: 1, color: 0x270e00 });
          break;
        case MiningTileType.ENTRANCE:
          // Ladder / exit
          graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
          graphics.fill(0x064e3b); // emerald-950
          // Draw ladder rungs
          graphics.rect(16, 0, 4, TILE_SIZE);
          graphics.rect(44, 0, 4, TILE_SIZE);
          graphics.fill(0x451a03);
          for (let i = 8; i < TILE_SIZE; i += 12) {
            graphics.rect(16, i, 32, 4);
            graphics.fill(0x451a03);
          }
          graphics.stroke({ width: 0.5, color: 0x022c22 });
          break;
      }
    }
  };

  useEffect(() => {
    if (!app || !app.stage || !sessionState) return;

    let active = true;

    // 1. Create Grid Container and Sub-Containers for Layering
    const gridContainer = new Container();
    app.stage.addChild(gridContainer);
    gridContainerRef.current = gridContainer;

    const tilesContainer = new Container();
    gridContainer.addChild(tilesContainer);
    tilesContainerRef.current = tilesContainer;

    const droppedItemsContainer = new Container();
    gridContainer.addChild(droppedItemsContainer);
    droppedItemsContainerRef.current = droppedItemsContainer;

    const playerContainer = new Container();
    gridContainer.addChild(playerContainer);
    playerContainerRef.current = playerContainer;

    // 2. Set up player sprite
    const playerX = sessionState.position.x * TILE_SIZE + TILE_SIZE / 2;
    const playerY = sessionState.position.y * TILE_SIZE + TILE_SIZE / 2;

    const playerSprite = new CompositeEntitySprite(playerContainer, baseBodyUrl);
    playerSpriteRef.current = playerSprite;

    const initPlayer = async () => {
      await playerSprite.load();
      if (!active) return;
      playerSprite.setPosition(playerX, playerY);
      
      // Scale down slightly to fit the 64px tile cleanly (base composite is larger)
      playerSprite.setScale(0.18);
      
      if (gearLayers.length > 0) {
        await playerSprite.setGearLayers(gearLayers);
      }
    };
    initPlayer();

    // Draw full grid initially
    for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
      for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
        const tile = sessionState.grid[y][x];
        drawTile(tilesContainer, x, y, tile.type, tile.revealed);
      }
    }

    // 4. Position camera instantly at start
    const viewportWidth = app.renderer.width;
    const viewportHeight = app.renderer.height;
    gridContainer.x = viewportWidth / 2 - playerX;
    gridContainer.y = viewportHeight / 2 - playerY;

    // 5. Setup rendering and logic tick handler
    const tickHandler = () => {
      if (!active) return;

      // Handle player slide transition
      if (isSlidingRef.current) {
        const elapsed = Date.now() - slideStartTimeRef.current;
        const progress = Math.min(1, elapsed / SLIDE_DURATION);

        const currentSlideX = slideStartXRef.current + (slideTargetXRef.current - slideStartXRef.current) * progress;
        const currentSlideY = slideStartYRef.current + (slideTargetYRef.current - slideStartYRef.current) * progress;

        playerSprite.setPosition(currentSlideX, currentSlideY);

        if (progress >= 1) {
          isSlidingRef.current = false;
        }
      }

      // Smooth camera follow
      const viewW = app.renderer.width;
      const viewH = app.renderer.height;
      const px = playerSprite.getContainer()?.x ?? playerX;
      const py = playerSprite.getContainer()?.y ?? playerY;

      const targetCamX = viewW / 2 - px;
      const targetCamY = viewH / 2 - py;

      gridContainer.x += (targetCamX - gridContainer.x) * 0.15;
      gridContainer.y += (targetCamY - gridContainer.y) * 0.15;
    };
    app.ticker.add(tickHandler);

    return () => {
      active = false;
      app.ticker.remove(tickHandler);

      // Destroy player sprite
      if (playerSpriteRef.current) {
        playerSpriteRef.current.destroy();
        playerSpriteRef.current = null;
      }

      // Destroy tile graphics
      tileGraphicsMap.current.forEach((g) => g.destroy());
      tileGraphicsMap.current.clear();

      // Clean up dropped sprites
      droppedSpritesMap.current.forEach((s) => s.destroy());
      droppedSpritesMap.current.clear();

      // Destroy grid container
      if (gridContainerRef.current) {
        if (gridContainerRef.current.parent) {
          gridContainerRef.current.parent.removeChild(gridContainerRef.current);
        }
        gridContainerRef.current.destroy({ children: true });
        gridContainerRef.current = null;
      }
      tilesContainerRef.current = null;
      droppedItemsContainerRef.current = null;
      playerContainerRef.current = null;
    };
  }, [app, baseBodyUrl]);

  // Effect to react to gear layer changes
  useEffect(() => {
    if (playerSpriteRef.current) {
      playerSpriteRef.current.setGearLayers(gearLayers);
    }
  }, [gearLayers]);

  // Effect to react to session state changes (e.g. grid updates, player movements)
  useEffect(() => {
    if (!sessionState || !gridContainerRef.current) return;

    const tilesContainer = tilesContainerRef.current;
    const droppedItemsContainer = droppedItemsContainerRef.current;
    if (!tilesContainer || !droppedItemsContainer) return;

    // Trigger sliding animation when position changes
    const targetX = sessionState.position.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = sessionState.position.y * TILE_SIZE + TILE_SIZE / 2;

    if (playerSpriteRef.current) {
      const container = playerSpriteRef.current.getContainer();
      if (container) {
        const dx = Math.abs(container.x - targetX);
        const dy = Math.abs(container.y - targetY);
        // If it's a movement of ~1 tile, slide smoothly, otherwise warp instantly (e.g. initial load)
        if ((dx > 1 || dy > 1) && dx < TILE_SIZE * 2 && dy < TILE_SIZE * 2) {
          slideStartXRef.current = container.x;
          slideStartYRef.current = container.y;
          slideTargetXRef.current = targetX;
          slideTargetYRef.current = targetY;
          slideStartTimeRef.current = Date.now();
          isSlidingRef.current = true;
        } else if (dx > 1 || dy > 1) {
          // Warp
          playerSpriteRef.current.setPosition(targetX, targetY);
          isSlidingRef.current = false;
        }
      }
    }

    for (let y = 0; y < MINING_CONFIG.GRID_HEIGHT; y++) {
      for (let x = 0; x < MINING_CONFIG.GRID_WIDTH; x++) {
        const tile = sessionState.grid[y][x];
        drawTile(tilesContainer, x, y, tile.type, tile.revealed);
      }
    }

    // Render dropped items
    const nextDroppedKeys = new Set<string>();
    sessionState.droppedItems.forEach((item) => {
      const key = `${item.position.x},${item.position.y}_${item.itemId}`;
      nextDroppedKeys.add(key);

      if (!droppedSpritesMap.current.has(key)) {
        // Create visual representation for dropped item
        const itemX = item.position.x * TILE_SIZE + TILE_SIZE / 2;
        const itemY = item.position.y * TILE_SIZE + TILE_SIZE / 2;

        if (item.iconUrl) {
          const loadAndAddSprite = async () => {
            try {
              const srcUrl = getAssetUrl(item.iconUrl);
              const texture = await Assets.load({ src: srcUrl, alias: `dropped_${item.itemId}` });
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              sprite.x = itemX;
              sprite.y = itemY;
              sprite.scale.set(0.5); // scale down icon to fit tile
              droppedItemsContainer.addChild(sprite);
              droppedSpritesMap.current.set(key, sprite);
            } catch (e) {
              // Fallback if load fails
              const fallback = new Graphics();
              fallback.x = itemX;
              fallback.y = itemY;
              fallback.circle(0, 0, 10);
              fallback.fill(0xf43f5e); // rose-500 glow
              fallback.stroke({ width: 1, color: 0xffffff });
              droppedItemsContainer.addChild(fallback);
              droppedSpritesMap.current.set(key, fallback);
            }
          };
          loadAndAddSprite();
        } else {
          const fallback = new Graphics();
          fallback.x = itemX;
          fallback.y = itemY;
          fallback.circle(0, 0, 10);
          fallback.fill(0xf43f5e);
          fallback.stroke({ width: 1, color: 0xffffff });
          droppedItemsContainer.addChild(fallback);
          droppedSpritesMap.current.set(key, fallback);
        }
      }
    });

    // Remove old dropped items no longer on map
    droppedSpritesMap.current.forEach((sprite, key) => {
      if (!nextDroppedKeys.has(key)) {
        droppedItemsContainer.removeChild(sprite);
        sprite.destroy();
        droppedSpritesMap.current.delete(key);
      }
    });
  }, [sessionState]);

  // Keyboard Event Handler
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const currentProps = propsRef.current;
      const { sessionState: state, onMove: moveAction, onMineStart: mineAction, isProcessing: proc } = currentProps;

      if (!state || proc || isSlidingRef.current || state.isMining) return;

      let direction: MiningDirection | null = null;
      let dx = 0;
      let dy = 0;

      if (key === 'w' || key === 'arrowup') {
        direction = 'up';
        dy = -1;
      } else if (key === 's' || key === 'arrowdown') {
        direction = 'down';
        dy = 1;
      } else if (key === 'a' || key === 'arrowleft') {
        direction = 'left';
        dx = -1;
      } else if (key === 'd' || key === 'arrowright') {
        direction = 'right';
        dx = 1;
      }

      if (!direction) return;

      const targetX = state.position.x + dx;
      const targetY = state.position.y + dy;

      // Check bounds
      if (
        targetX < 0 ||
        targetX >= MINING_CONFIG.GRID_WIDTH ||
        targetY < 0 ||
        targetY >= MINING_CONFIG.GRID_HEIGHT
      ) {
        return;
      }

      const tile = state.grid[targetY][targetX];

      // If tile is revealed and empty or exit (or has a dropped item), move
      const hasDroppedItem = state.droppedItems.some(
        (item) => item.position.x === targetX && item.position.y === targetY
      );

      if (tile.revealed && (tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE || hasDroppedItem)) {
        await moveAction(direction);
      } else {
        // Unrevealed tiles are assumed DIRT block by client and are minable.
        // Rock cannot be mined manually.
        if (tile.revealed && tile.type === MiningTileType.ROCK) {
          notificationService.error('Obstruction', 'Rocks are too hard to mine by hand. Use dynamite!');
          return;
        }

        // Start mining block
        await mineAction({ x: targetX, y: targetY });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return <div className="mining-grid-container" />;
};
