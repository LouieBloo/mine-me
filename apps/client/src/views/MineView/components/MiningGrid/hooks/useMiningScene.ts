import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, TilingSprite, Assets, Texture } from 'pixi.js';
import { ModularCharacterSprite, type GearLayerDescriptor } from '../../../../../components/game/sprites';
import { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import { Camera2D } from '../../../../../components/game/camera/Camera2D';
import {
  MiningTileType,
  MINING_CONFIG,
  getAssetUrl,
  type MiningSessionClientState,
  type Vector2D,
} from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

export interface UseMiningSceneOptions {
  app: Application | null;
  initialSessionState: MiningSessionClientState;
  gearLayers: GearLayerDescriptor[];
  playerFacingDirRef: React.MutableRefObject<Vector2D>;
  isFacingLeftRef: React.MutableRefObject<boolean>;
  zoom: number;
  onAssetsLoaded?: () => void;
}

export function useMiningScene({
  app,
  initialSessionState,
  gearLayers,
  playerFacingDirRef,
  isFacingLeftRef,
  zoom,
  onAssetsLoaded,
}: UseMiningSceneOptions) {
  const [containersReady, setContainersReady] = useState<boolean>(false);
  const [tileTextureLoaded, setTileTextureLoaded] = useState<number>(0);

  const cameraRef = useRef<Camera2D | null>(null);
  const gridContainerRef = useRef<Container | null>(null);
  const backgroundContainerRef = useRef<Container | null>(null);
  const tilesContainerRef = useRef<Container | null>(null);
  const fallingRocksContainerRef = useRef<Container | null>(null);
  const droppedItemsContainerRef = useRef<Container | null>(null);
  const playerContainerRef = useRef<Container | null>(null);
  const debugGraphicsRef = useRef<Graphics | null>(null);

  const tileGraphicsMap = useRef<Map<string, Graphics>>(new Map());
  const tileSpritesMap = useRef<Map<string, Sprite>>(new Map());
  const blockTexturesRef = useRef<Map<number, Texture>>(new Map());
  const droppedSpritesMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const fallingRockGraphicsMap = useRef<Map<string, Graphics>>(new Map());

  const playerSpriteRef = useRef<ModularCharacterSprite | null>(null);
  const lightingEngineRef = useRef<LightingEngine | null>(null);
  const flashlightRef = useRef<SpotLight | null>(null);

  const gearLayersRef = useRef<GearLayerDescriptor[]>(gearLayers);
  useEffect(() => {
    gearLayersRef.current = gearLayers;
    if (playerSpriteRef.current) {
      playerSpriteRef.current.setGearLayers(gearLayers);
    }
  }, [gearLayers]);

  const onAssetsLoadedRef = useRef(onAssetsLoaded);
  useEffect(() => {
    onAssetsLoadedRef.current = onAssetsLoaded;
  }, [onAssetsLoaded]);

  // Setup Pixi Containers, Camera, Lighting & Asset Loading
  useEffect(() => {
    if (!app) return;

    const gridContainer = new Container();
    const backgroundContainer = new Container();
    const tilesContainer = new Container();
    const fallingRocksContainer = new Container();
    const droppedItemsContainer = new Container();
    const playerContainer = new Container();
    const debugContainer = new Container();

    // Render background: Sky above ground (y <= 0), rich underground dirt backdrop (y > 0)
    const bgGraphics = new Graphics();
    const bgWidth = MINING_CONFIG.GRID_WIDTH * TILE_SIZE;
    const bgHeight = MINING_CONFIG.GRID_HEIGHT * TILE_SIZE;
    const skyHeight = 2000;
    const extraMargin = 2000;

    // Sky above ground (nice vibrant blue)
    bgGraphics.rect(-extraMargin, -skyHeight, bgWidth + extraMargin * 2, skyHeight);
    bgGraphics.fill(0x38bdf8);

    // Underground base earthen tone fallback (y >= 0)
    bgGraphics.rect(-extraMargin, 0, bgWidth + extraMargin * 2, bgHeight + extraMargin * 2);
    bgGraphics.fill(0x23140c);

    backgroundContainer.addChild(bgGraphics);

    const debugGraphics = new Graphics();
    debugContainer.addChild(debugGraphics);
    debugGraphicsRef.current = debugGraphics;

    gridContainer.addChild(backgroundContainer);
    gridContainer.addChild(tilesContainer);
    gridContainer.addChild(fallingRocksContainer);
    gridContainer.addChild(droppedItemsContainer);
    gridContainer.addChild(playerContainer);
    gridContainer.addChild(debugContainer);
    app.stage.addChild(gridContainer);

    gridContainerRef.current = gridContainer;
    backgroundContainerRef.current = backgroundContainer;
    tilesContainerRef.current = tilesContainer;
    fallingRocksContainerRef.current = fallingRocksContainer;
    droppedItemsContainerRef.current = droppedItemsContainer;
    playerContainerRef.current = playerContainer;
    setContainersReady(true);

    // Initialize Camera2D system
    const camera = new Camera2D({
      targetContainer: gridContainer,
      screenWidth: app.screen.width,
      screenHeight: app.screen.height,
      defaultZoom: zoom,
    });
    cameraRef.current = camera;

    // Initialize 2D Lighting Engine with Flashlight and Entrance Torch
    const lightingEngine = new LightingEngine(
      app,
      gridContainer,
      MINING_CONFIG.GRID_WIDTH,
      MINING_CONFIG.GRID_HEIGHT,
      TILE_SIZE
    );

    const flashlight = new SpotLight(
      'player_flashlight',
      { x: initialSessionState.position.x, y: initialSessionState.position.y - 0.28 },
      playerFacingDirRef.current,
      0xfffae6,
      1.1,
      MINING_CONFIG.FLASHLIGHT_RADIUS,
      MINING_CONFIG.FLASHLIGHT_CONE_ANGLE,
      MINING_CONFIG.FLASHLIGHT_AURA_RADIUS
    );
    flashlight.enabled = false; // Default to OFF on game start
    lightingEngine.addLight(flashlight);
    flashlightRef.current = flashlight;

    const entranceTorch = new PointLight(
      'entrance_torch',
      { x: MINING_CONFIG.ENTRANCE_X + 0.5, y: MINING_CONFIG.ENTRANCE_Y + 0.5 },
      0xf59e0b,
      1.15,
      MINING_CONFIG.TORCH_RADIUS,
      {
        flicker: {
          speed: MINING_CONFIG.TORCH_FLICKER_SPEED,
          amount: MINING_CONFIG.TORCH_FLICKER_AMOUNT,
        },
      }
    );
    lightingEngine.addLight(entranceTorch);

    // Initial sunlight calculation
    lightingEngine.updateGrid(initialSessionState.grid);
    lightingEngineRef.current = lightingEngine;

    // Load assets in parallel: cave tiling background, dirt block texture + modular character sprite with gear
    const loadAllAssets = async () => {
      const dirtBgUrl = getAssetUrl('/assets/mining/underground-dirt-bg.jpg');
      const bgPromise = Assets.load(dirtBgUrl)
        .then((texture) => {
          if (!gridContainerRef.current) return;
          const dirtTilingSprite = new TilingSprite({
            texture,
            width: bgWidth + extraMargin * 2,
            height: bgHeight + extraMargin * 2,
          });
          dirtTilingSprite.x = -extraMargin;
          dirtTilingSprite.y = 0;
          dirtTilingSprite.tileScale.set(0.125); // Dense fine-grain repeat
          backgroundContainer.addChild(dirtTilingSprite);
        })
        .catch((err) => {
          console.warn('[MiningGrid] Could not load underground dirt background texture:', err);
        });

      // Fetch Mining Block configs and load custom textures
      const blockPromises: Promise<any>[] = [];
      try {
        const res = await fetch(getAssetUrl('/api/public/blocks'));
        if (res.ok) {
          const blocks = await res.json();
          for (const blk of blocks) {
            if (blk.textureUrl) {
              const tileType = MiningTileType[blk.typeKey as keyof typeof MiningTileType];
              if (tileType !== undefined) {
                const p = Assets.load(getAssetUrl(blk.textureUrl))
                  .then((tex) => {
                    blockTexturesRef.current.set(tileType, tex);
                    setTileTextureLoaded((prev) => prev + 1);
                  })
                  .catch((err) => {
                    console.warn(`[MiningGrid] Could not load texture for block ${blk.typeKey}:`, err);
                  });
                blockPromises.push(p);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[MiningGrid] Could not fetch public blocks, falling back to default textures:', err);
        // Fallback for default dirt texture
        const dirtTileUrl = getAssetUrl('/assets/mining/dirt-block.jpg');
        const fallbackPromise = Assets.load(dirtTileUrl)
          .then((texture) => {
            blockTexturesRef.current.set(MiningTileType.DIRT, texture);
            setTileTextureLoaded((prev) => prev + 1);
          })
          .catch((e) => {
            console.warn('[MiningGrid] Could not load default dirt texture:', e);
          });
        blockPromises.push(fallbackPromise);

        // Fallback for ladder texture
        const ladderTileUrl = getAssetUrl('/assets/mining/block_entrance-block.png');
        const ladderFallbackPromise = Assets.load(ladderTileUrl)
          .then((texture) => {
            blockTexturesRef.current.set(MiningTileType.LADDER, texture);
            setTileTextureLoaded((prev) => prev + 1);
          })
          .catch((e) => {
            console.warn('[MiningGrid] Could not load default ladder texture:', e);
          });
        blockPromises.push(ladderFallbackPromise);
      }

      // Create Modular Character Sprite (initially hidden)
      const sprite = new ModularCharacterSprite(playerContainer);
      playerSpriteRef.current = sprite;

      const spritePromise = (async () => {
        try {
          await sprite.load();
          if (gearLayersRef.current && gearLayersRef.current.length > 0) {
            await sprite.setGearLayers(gearLayersRef.current);
          }

          // Scale sprite deterministically based on reference height to fit tile height (~34.5px tall)
          const targetHeight = TILE_SIZE * 1.08;
          sprite.scaleToHeight(targetHeight);

          // Foot alignment: unscaled feet are ~426px below pelvis origin.
          // Lower sprite by 15px so feet are firmly planted on the ground.
          const unscaledFootDepth = 426;
          const visualGroundOffset = 15;
          const footOffset =
            MINING_CONFIG.PLAYER_RADIUS -
            unscaledFootDepth * (targetHeight / ModularCharacterSprite.REFERENCE_HEIGHT) +
            visualGroundOffset;
          sprite.setPosition(0, footOffset);

          if (isFacingLeftRef.current) {
            sprite.setFlipped(true);
          }

          // Now that sprite is fully loaded, rigged, scaled, and equipped, reveal it if still active
          if (gridContainerRef.current && playerSpriteRef.current === sprite) {
            sprite.setVisible(true);
          }
        } catch (err) {
          console.error('[MiningGrid] Error loading character sprite:', err);
        }
      })();

      await Promise.allSettled([bgPromise, spritePromise, ...blockPromises]);
      if (gridContainerRef.current) {
        onAssetsLoadedRef.current?.();
      }
    };

    loadAllAssets();

    return () => {
      setContainersReady(false);
      if (cameraRef.current) {
        cameraRef.current.destroy();
        cameraRef.current = null;
      }
      if (playerSpriteRef.current) {
        playerSpriteRef.current.destroy();
        playerSpriteRef.current = null;
      }
      lightingEngine.destroy();
      lightingEngineRef.current = null;
      flashlightRef.current = null;
      if (app.stage && gridContainer.parent === app.stage) {
        app.stage.removeChild(gridContainer);
      }
      gridContainer.destroy({ children: true });
    };
  }, [app]);

  // Synchronize zoom level dynamically with Camera2D
  useEffect(() => {
    if (cameraRef.current && zoom) {
      cameraRef.current.setZoom(zoom);
    }
  }, [zoom]);

  return {
    containersReady,
    tileTextureLoaded,
    cameraRef,
    gridContainerRef,
    backgroundContainerRef,
    tilesContainerRef,
    fallingRocksContainerRef,
    droppedItemsContainerRef,
    playerContainerRef,
    debugGraphicsRef,
    tileGraphicsMap,
    tileSpritesMap,
    blockTexturesRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    playerSpriteRef,
    lightingEngineRef,
    flashlightRef,
  };
}
