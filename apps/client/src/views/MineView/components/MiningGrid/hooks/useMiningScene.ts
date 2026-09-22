import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, TilingSprite, Assets, Texture } from 'pixi.js';
import { ModularCharacterSprite, type GearLayerDescriptor } from '../../../../../components/game/sprites';
import { MiningRemotePlayerRenderer } from '../renderers/MiningRemotePlayerRenderer';
import { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import { Camera2D } from '../../../../../components/game/camera/Camera2D';
import { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import {
  MiningTileType,
  MINING_CONFIG,
  DEFAULT_PARTICLE_EFFECTS,
  type ParticleEffectConfig,
  getAssetUrl,
  type MiningSessionClientState,
  type Vector2D,
} from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';

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
  const reticleGraphicsRef = useRef<Graphics | null>(null);
  const debugGraphicsRef = useRef<Graphics | null>(null);

  const tileGraphicsMap = useRef<Map<string, Graphics>>(new Map());
  const tileSpritesMap = useRef<Map<string, Sprite>>(new Map());
  const blockTexturesRef = useRef<Map<number, Texture>>(new Map());
  const blockParticleConfigsRef = useRef<Map<MiningTileType, ParticleEffectConfig>>(
    new Map([
      [MiningTileType.COPPERIUM, DEFAULT_PARTICLE_EFFECTS.fairy_sparkle],
      [MiningTileType.SILVERIUM, DEFAULT_PARTICLE_EFFECTS.fairy_sparkle],
    ])
  );
  const droppedSpritesMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const fallingRockGraphicsMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const dynamitesContainerRef = useRef<Container | null>(null);
  const dynamiteGraphicsMap = useRef<Map<string, Sprite | Graphics>>(new Map());
  const dynamiteTextureRef = useRef<Texture | null>(null);

  const playerSpriteRef = useRef<ModularCharacterSprite | null>(null);
  const otherPlayersContainerRef = useRef<Container | null>(null);
  const remotePlayerRendererRef = useRef<MiningRemotePlayerRenderer | null>(null);
  const lightingEngineRef = useRef<LightingEngine | null>(null);
  const flashlightRef = useRef<SpotLight | null>(null);
  const particleEngineRef = useRef<ParticleEngine | null>(null);
  const particlesContainerRef = useRef<Container | null>(null);

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
    const dynamitesContainer = new Container();
    const otherPlayersContainer = new Container();
    const playerContainer = new Container();
    const particlesContainer = new Container();
    const debugContainer = new Container();

    // Render background: Sky above ground (y <= 0), rich underground dirt backdrop (y > 0)
    const bgGraphics = new Graphics();
    const bgWidth = MINING_CONFIG.GRID_WIDTH * TILE_SIZE;
    const bgHeight = MINING_CONFIG.GRID_HEIGHT * TILE_SIZE;
    const skyHeight = 800;
    const extraMargin = 600;

    // Sky above ground (nice vibrant blue)
    bgGraphics.rect(-extraMargin, -skyHeight, bgWidth + extraMargin * 2, skyHeight);
    bgGraphics.fill(0x38bdf8);

    // Underground base earthen tone fallback (y >= 0)
    bgGraphics.rect(-extraMargin, 0, bgWidth + extraMargin * 2, bgHeight + extraMargin * 2);
    bgGraphics.fill(0x23140c);

    backgroundContainer.addChild(bgGraphics);

    const reticleContainer = new Container();
    const reticleGraphics = new Graphics();
    reticleContainer.addChild(reticleGraphics);
    reticleGraphicsRef.current = reticleGraphics;

    const debugGraphics = new Graphics();
    debugContainer.addChild(debugGraphics);
    debugGraphicsRef.current = debugGraphics;

    gridContainer.addChild(backgroundContainer);
    gridContainer.addChild(tilesContainer);
    gridContainer.addChild(fallingRocksContainer);
    gridContainer.addChild(droppedItemsContainer);
    gridContainer.addChild(dynamitesContainer);
    gridContainer.addChild(reticleContainer);
    gridContainer.addChild(otherPlayersContainer);
    gridContainer.addChild(playerContainer);
    gridContainer.addChild(particlesContainer);
    gridContainer.addChild(debugContainer);
    app.stage.addChild(gridContainer);

    gridContainerRef.current = gridContainer;
    backgroundContainerRef.current = backgroundContainer;
    tilesContainerRef.current = tilesContainer;
    fallingRocksContainerRef.current = fallingRocksContainer;
    droppedItemsContainerRef.current = droppedItemsContainer;
    dynamitesContainerRef.current = dynamitesContainer;
    otherPlayersContainerRef.current = otherPlayersContainer;
    playerContainerRef.current = playerContainer;
    particlesContainerRef.current = particlesContainer;

    const particleEngine = new ParticleEngine(particlesContainer, app.renderer, 3000);
    particleEngineRef.current = particleEngine;

    const remotePlayerRenderer = new MiningRemotePlayerRenderer(otherPlayersContainer);
    remotePlayerRendererRef.current = remotePlayerRenderer;
    if (initialSessionState.otherPlayers) {
      remotePlayerRenderer.updatePlayers(initialSessionState.otherPlayers);
    }

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
    remotePlayerRenderer.setLightingEngine(lightingEngine);

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
            width: bgWidth,
            height: bgHeight,
          });
          dirtTilingSprite.x = 0;
          dirtTilingSprite.y = 0;
          dirtTilingSprite.tileScale.set(0.5); // Rich natural underground dirt repeat
          dirtTilingSprite.cullable = true;
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
            const tileType = MiningTileType[blk.typeKey as keyof typeof MiningTileType];
            if (tileType !== undefined) {
              if (blk.idleParticleEffect?.config) {
                blockParticleConfigsRef.current.set(tileType, blk.idleParticleEffect.config);
              } else if (blk.idleParticleEffect?.name && (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[blk.idleParticleEffect.name]) {
                blockParticleConfigsRef.current.set(tileType, (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[blk.idleParticleEffect.name]);
              } else if (blk.idleParticleEffectId && (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[blk.idleParticleEffectId]) {
                blockParticleConfigsRef.current.set(tileType, (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[blk.idleParticleEffectId]);
              } else if (blk.idleParticleEffectId === null) {
                blockParticleConfigsRef.current.delete(tileType);
              }

              if (blk.textureUrl) {
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

        // Fallback for rock texture
        const rockTileUrl = getAssetUrl('/assets/mining/block_rock-block.jpg');
        const rockFallbackPromise = Assets.load(rockTileUrl)
          .then((texture) => {
            blockTexturesRef.current.set(MiningTileType.ROCK, texture);
            setTileTextureLoaded((prev) => prev + 1);
          })
          .catch((e) => {
            console.warn('[MiningGrid] Could not load default rock texture:', e);
          });
        blockPromises.push(rockFallbackPromise);

        // Fallback for Copperium texture
        const copperiumTileUrl = getAssetUrl('/assets/mining/block_copperium-block.jpg');
        const copperiumFallbackPromise = Assets.load(copperiumTileUrl)
          .then((texture) => {
            blockTexturesRef.current.set(MiningTileType.COPPERIUM, texture);
            setTileTextureLoaded((prev) => prev + 1);
          })
          .catch((e) => {
            console.warn('[MiningGrid] Could not load default copperium texture:', e);
          });
        blockPromises.push(copperiumFallbackPromise);

        // Fallback for Silverium texture
        const silveriumTileUrl = getAssetUrl('/assets/mining/block_silverium-block.jpg');
        const silveriumFallbackPromise = Assets.load(silveriumTileUrl)
          .then((texture) => {
            blockTexturesRef.current.set(MiningTileType.SILVERIUM, texture);
            setTileTextureLoaded((prev) => prev + 1);
          })
          .catch((e) => {
            console.warn('[MiningGrid] Could not load default silverium texture:', e);
          });
        blockPromises.push(silveriumFallbackPromise);
      }

      // Fetch dynamic particle effects from API
      try {
        const peRes = await fetch(getAssetUrl('/api/public/particle-effects'));
        if (peRes.ok) {
          const effects = await peRes.json();
          if (Array.isArray(effects)) {
            DynamiteVisualManager.setCustomParticleEffects(effects);
          }
        }
      } catch (err) {
        console.warn('[MiningGrid] Could not load dynamic particle effects:', err);
      }

      // Always load Torch and Ladder tile textures
      const torchTileUrl = getAssetUrl('/assets/icons/items/cmt4m445e0000xx0vdu7ve6q0_icon.png');
      const torchPromise = Assets.load(torchTileUrl)
        .then((texture) => {
          blockTexturesRef.current.set(MiningTileType.TORCH, texture);
          setTileTextureLoaded((prev) => prev + 1);
        })
        .catch((e) => {
          console.warn('[MiningGrid] Could not load torch texture:', e);
        });
      blockPromises.push(torchPromise);

      const ladderAlwaysTileUrl = getAssetUrl('/assets/icons/items/cmts2w7ql0000ji8t408x8rci_icon.png');
      const ladderAlwaysPromise = Assets.load(ladderAlwaysTileUrl)
        .then((texture) => {
          blockTexturesRef.current.set(MiningTileType.LADDER, texture);
          setTileTextureLoaded((prev) => prev + 1);
        })
        .catch((e) => {
          console.warn('[MiningGrid] Could not load ladder texture:', e);
        });
      blockPromises.push(ladderAlwaysPromise);

      // Create Modular Character Sprite (initially hidden)
      const sprite = new ModularCharacterSprite(playerContainer);
      playerSpriteRef.current = sprite;

      // Load dynamite icon texture for thrown dynamite rendering
      const dynamiteIconUrl = getAssetUrl('/assets/icons/items/cmtz702uk0001nu7bn2tidnx0_icon.png');
      Assets.load(dynamiteIconUrl)
        .then((texture) => {
          dynamiteTextureRef.current = texture;
        })
        .catch(() => {});

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
      if (remotePlayerRendererRef.current) {
        remotePlayerRendererRef.current.destroy();
        remotePlayerRendererRef.current = null;
      }
      if (playerSpriteRef.current) {
        playerSpriteRef.current.destroy();
        playerSpriteRef.current = null;
      }
      if (particleEngineRef.current) {
        particleEngineRef.current.destroy();
        particleEngineRef.current = null;
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
    particlesContainerRef,
    fallingRocksContainerRef,
    droppedItemsContainerRef,
    dynamitesContainerRef,
    otherPlayersContainerRef,
    playerContainerRef,
    reticleGraphicsRef,
    debugGraphicsRef,
    tileGraphicsMap,
    tileSpritesMap,
    blockTexturesRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    dynamiteGraphicsMap,
    dynamiteTextureRef,
    playerSpriteRef,
    remotePlayerRendererRef,
    lightingEngineRef,
    flashlightRef,
    particleEngineRef,
    blockParticleConfigsRef,
  };
}
