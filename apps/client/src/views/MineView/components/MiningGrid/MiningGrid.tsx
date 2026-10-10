import React, { useEffect, useRef, useMemo, useState } from 'react';
import { usePixiStage } from '../../../../components/game/PixiStageContext/PixiStageContext';
import { type GearLayerDescriptor } from '../../../../components/game/sprites';
import {
  type MiningSessionClientState,
  type PlayerState,
  type Vector2D,
  type MiningClientTile,
  type MiningPosition,
  MiningPlayerBody,
  getAssetUrl,
  type MiningActiveDynamite,
  type MiningActiveProjectile,
  type MiningDroppedItem,
  type MiningBackpackItem,
  type GameItem,
  CharacterModEngine,
  calculateEffectiveSwingSpeed,
} from '@mine-me/shared';
import type { EmitterHandle } from '../../../../components/game/particles/ParticleEngine';
import { useSocket } from '../../../../contexts/SocketContext';
import { useSound } from '../../../../contexts/SoundContext';
import { MiningMouseController } from './input/MiningMouseController';
import { useMiningInput } from './hooks/useMiningInput';
import { useMiningScene } from './hooks/useMiningScene';
import { useMiningActions } from './hooks/useMiningActions';
import { useMiningAmbientEffects } from './hooks/useMiningAmbientEffects';
import { useMiningStateSync } from './hooks/useMiningStateSync';
import { ReloadSoundTrigger } from './systems/ReloadSoundTrigger';
import { usePlayerDamageEvents } from './hooks/usePlayerDamageEvents';
import { useMiningTicker } from './hooks/useMiningTicker';
import { TILE_SIZE } from './renderers/MiningTileRenderer';
import { DynamiteVisualManager } from './renderers/DynamiteVisualManager';
import { DroppedItemVisualManager } from './renderers/DroppedItemVisualManager';
import { ProjectileVisualManager } from './renderers/ProjectileVisualManager';
import { MiningPredictionState } from './systems/MiningPredictionState';
import type { MiningClientWorld } from './systems/MiningClientWorld';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
  onAssetsLoaded?: () => void;
  onLoadProgress?: (fraction: number) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  isPlacingTorch?: boolean;
  onTorchPlaced?: () => void;
  isPlacingLadder?: boolean;
  onLadderPlaced?: () => void;
  isThrowingDynamite?: boolean;
  isThrowingItem?: boolean;
  activeThrowableItem?: GameItem | null;
  onDynamiteThrown?: () => void;
  showDebug?: boolean;
  onToggleDebug?: () => void;
  onVisionChange?: (newVision: number) => void;
  onBackpackChange?: (newBackpack: MiningBackpackItem[]) => void;
}

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState: initialSessionState,
  playerState,
  onAssetsLoaded,
  onLoadProgress,
  zoom = 1.5,
  onZoomChange,
  isPlacingTorch = false,
  onTorchPlaced,
  isPlacingLadder = false,
  onLadderPlaced,
  isThrowingDynamite = false,
  isThrowingItem = false,
  activeThrowableItem = null,
  onDynamiteThrown,
  showDebug,
  onToggleDebug,
  onVisionChange,
  onBackpackChange,
}) => {
  const { app } = usePixiStage();
  const { onEvent, sendGameEvent } = useSocket();
  const { soundManager } = useSound();

  // Authoritative in-memory grid ref (avoids React state thrashing and 5,000-tile clones)
  const gridRef = useRef<MiningClientTile[][]>(
    initialSessionState.grid.map((row) => row.map((tile) => ({ ...tile })))
  );

  // Client-Side Prediction Physics Body for local player
  const playerBodyRef = useRef<MiningPlayerBody>(
    new MiningPlayerBody(initialSessionState.position)
  );

  // Fixed-step prediction + reconciliation for the local player (wraps the body above)
  const predictionRef = useRef<MiningPredictionState | null>(null);
  if (!predictionRef.current) {
    predictionRef.current = new MiningPredictionState(playerBodyRef.current, {
      up: false, down: false, left: false, right: false, jump: false, miningKey: false, sequence: 0,
    });
  }

  // Interaction and mining state refs
  const isMiningRef = useRef<boolean>(initialSessionState.isMining ?? false);
  const miningTargetRef = useRef<MiningPosition | null>(initialSessionState.miningTarget ?? null);

  // Object-Oriented Mouse Controller Ref
  const mouseControllerRef = useRef<MiningMouseController>(new MiningMouseController({ tileSize: TILE_SIZE }));

  // Direction and Debug state references
  const isFacingLeftRef = useRef<boolean>(false);
  const playerFacingDirRef = useRef<Vector2D>({ x: 1, y: 0 });
  const showDebugRef = useRef<boolean>(showDebug ?? false);

  // Synchronize showDebug prop with internal ref
  useEffect(() => {
    if (showDebug !== undefined) {
      showDebugRef.current = showDebug;
    }
  }, [showDebug]);

  // Synchronize audio listener position with local player position
  useEffect(() => {
    soundManager.setListenerPosition?.(playerBodyRef.current.position);
    return () => {
      soundManager.setListenerPosition?.(null);
    };
  }, [soundManager]);

  const activeFallingRocksRef = useRef<{ id: string; x: number; y: number }[]>([]);
  const activeDynamitesRef = useRef<MiningActiveDynamite[]>([]);
  const activeProjectilesRef = useRef<MiningActiveProjectile[]>([]);
  const dynamiteVisualManagerRef = useRef<DynamiteVisualManager>(new DynamiteVisualManager());
  const projectileVisualManagerRef = useRef<ProjectileVisualManager>(new ProjectileVisualManager());
  const droppedItemVisualManagerRef = useRef<DroppedItemVisualManager>(new DroppedItemVisualManager());
  const droppedItemsRef = useRef<MiningDroppedItem[]>([]);

  // Smooth rendering lerp position references
  const currentRenderPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });
  const targetServerPosRef = useRef<Vector2D>({
    x: initialSessionState.position.x,
    y: initialSessionState.position.y,
  });

  const [dynamicItems, setDynamicItems] = useState<GameItem[]>([]);

  useEffect(() => {
    fetch(getAssetUrl(`/api/public/items?_t=${Date.now()}`))
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        if (Array.isArray(items)) {
          setDynamicItems(items);
        }
      })
      .catch((err) => console.warn('[MiningGrid] Initial items fetch error:', err));
  }, []);

  // Gear layers derivation (merging live database item definitions so admin offset changes reflect immediately)
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState.inventory?.items) return [];
    const baseLayers: GearLayerDescriptor[] = playerState.inventory.items
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => {
        const dbItem = dynamicItems.find(
          (d: any) => d.id === inv.item.id || (d.itemKey && d.itemKey === inv.item.itemKey)
        );
        const item = dbItem ? { ...inv.item, ...dbItem } : inv.item;
        return {
          url: getAssetUrl(item.gearImageUrl),
          subType: item.subType as any,
          shootsProjectiles: Boolean(item.shootsProjectiles),
          throwable: Boolean(item.throwable),
          holdOffsetX: item.holdOffsetX,
          holdOffsetY: item.holdOffsetY,
          holdRotation: item.holdRotation,
          muzzleOffsetX: item.muzzleOffsetX,
          muzzleOffsetY: item.muzzleOffsetY,
        };
      });

    // If throwing a throwable item (e.g. dynamite), show the throwable item in the character's hand
    if ((isThrowingItem || isThrowingDynamite) && activeThrowableItem) {
      const dbThrowable = dynamicItems.find(
        (d: any) => d.id === activeThrowableItem.id || (d.itemKey && d.itemKey === activeThrowableItem.itemKey)
      );
      const item = dbThrowable ? { ...activeThrowableItem, ...dbThrowable } : activeThrowableItem;
      const throwableImg =
        item.gearImageUrl ||
        item.inGameSpriteUrl ||
        item.iconUrl;
      if (throwableImg) {
        const withoutWeapon = baseLayers.filter((l) => l.subType !== 'WEAPON');
        withoutWeapon.push({
          url: getAssetUrl(throwableImg),
          subType: 'WEAPON',
          shootsProjectiles: false,
          throwable: true,
          holdOffsetX: item.holdOffsetX,
          holdOffsetY: item.holdOffsetY,
          holdRotation: item.holdRotation,
          muzzleOffsetX: item.muzzleOffsetX,
          muzzleOffsetY: item.muzzleOffsetY,
        });
        return withoutWeapon;
      }
    }

    return baseLayers;
  }, [playerState.inventory?.items, isThrowingItem, isThrowingDynamite, activeThrowableItem, dynamicItems]);

  // Weapon derivation for in-game mining sound effect & projectile shooting
  const equippedWeapon = useMemo(() => {
    let weapon: GameItem | null = null;
    if (playerState.gear?.weapon) {
      weapon = playerState.gear.weapon;
    } else if (playerState.inventory?.items) {
      const items = playerState.inventory.items;
      const equipped = items.find(
        (inv) => inv.equipped && inv.item?.type === 'GEAR' && inv.item?.subType?.toUpperCase() === 'WEAPON'
      );
      if (equipped?.item) weapon = equipped.item;
    }
    if (!weapon) return null;
    const dbItem = dynamicItems.find(
      (d: any) => d.id === weapon!.id || (d.itemKey && d.itemKey === weapon!.itemKey)
    );
    return dbItem ? { ...weapon, ...dbItem } : weapon;
  }, [playerState.gear?.weapon, playerState.inventory?.items, dynamicItems]);

  // Derive effective mining swing speed (swings per second) based on weapon attack speed & mining speed attributes
  const effectiveMiningSwingSpeed = useMemo(() => {
    const mods = playerState.inventory?.items
      ? CharacterModEngine.getModifications(playerState.inventory.items)
      : undefined;
    const miningSpeed = mods?.miningSpeed ?? (playerState.attributes as any)?.miningSpeed ?? 100;
    return calculateEffectiveSwingSpeed(equippedWeapon, miningSpeed);
  }, [equippedWeapon, playerState.inventory?.items, playerState.attributes]);

  // Pixi Scene, Camera, Lighting & Asset Loading Hook
  const {
    containersReady,
    tileTextureLoaded,
    cameraRef,
    gridContainerRef,
    tilesContainerRef,
    fallingRocksContainerRef,
    droppedItemsContainerRef,
    dynamitesContainerRef,
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
    projectilesContainerRef,
    projectileGraphicsMap,
    projectileTexturesRef,
    dynamicItemsRef,
    playerSpriteRef,
    remotePlayerRendererRef,
    mobRendererRef,
    lightingEngineRef,
    flashlightRef,
    particleEngineRef,
    blockParticleConfigsRef,
    blockSoundsRef,
  } = useMiningScene({
    app,
    initialSessionState,
    gearLayers,
    playerFacingDirRef,
    isFacingLeftRef,
    zoom,
    onAssetsLoaded,
    onLoadProgress,
    soundManager,
    onDynamicItemsLoaded: setDynamicItems,
  });

  const torchEmittersRef = useRef<Map<string, EmitterHandle>>(new Map());
  const blockEmittersRef = useRef<Map<string, EmitterHandle>>(new Map());

  // Attach canvas to MouseController and sync camera
  useEffect(() => {
    if (!app?.canvas) return;
    const mouseController = mouseControllerRef.current;
    mouseController.attach(app.canvas);
    mouseController.setCamera(cameraRef.current);
    app.canvas.style.cursor = 'crosshair';
    return () => {
      mouseController.detach();
    };
  }, [app?.canvas, cameraRef]);

  // Initial Sync of grid with MouseController
  useEffect(() => {
    mouseControllerRef.current.setGrid(gridRef.current);
  }, []);

  // Configure Active Mouse Actions (Torch, Ladder, Throwables, Shooting, Weapon Sounds & Reload)
  const sceneWorld = {
    playerSpriteRef,
    gridContainerRef,
    mouseControllerRef,
    gridRef,
    playerBodyRef,
    tilesContainerRef,
    blockTexturesRef,
    tileGraphicsMap,
    tileSpritesMap,
    dynamiteVisualManagerRef,
    projectileVisualManagerRef,
    activeProjectilesRef,
    particleEngineRef,
    lightingEngineRef,
    dynamicItemsRef,
    flashlightRef,
    showDebugRef,
    playerFacingDirRef,
    isFacingLeftRef,
    torchEmittersRef,
    blockEmittersRef,
    blockParticleConfigsRef,
  };

  // One trigger shared by the R key and the server's ammo ticks, so a reload sounds once however it starts
  const reloadSoundRef = useRef<ReloadSoundTrigger | null>(null);
  if (!reloadSoundRef.current) reloadSoundRef.current = new ReloadSoundTrigger();

  const { weaponSoundUrlRef, weaponAmmoStateRef, handleWeaponReload } = useMiningActions({
    world: sceneWorld,
    playerState,
    equippedWeapon,
    containersReady,
    soundManager,
    sendGameEvent,
    isPlacingTorch,
    onTorchPlaced,
    isPlacingLadder,
    onLadderPlaced,
    isThrowingDynamite,
    isThrowingItem,
    activeThrowableItem,
    onDynamiteThrown,
    reloadSound: reloadSoundRef.current,
  });

  const lastWeaponSoundTimeRef = useRef<number>(0);

  // Real-time Input Controls Hook (Keyboard movement, debug toggle, camera zoom, flashlight toggle, weapon reload)
  const { keysPressedRef } = useMiningInput({
    world: sceneWorld,
    sendGameEvent,
    onToggleDebug,
    zoom,
    onZoomChange,
    onVisionChange,
    onReload: handleWeaponReload,
  });

  // Initial Full-Grid Render & Initial Dynamic Ambient Tile Lights/Emitters
  useMiningAmbientEffects({
    world: sceneWorld,
    containersReady,
    tileTextureLoaded,
  });

  // Hit knockback from the server is applied to the predicted player body
  usePlayerDamageEvents({ onEvent, playerBodyRef, predictorRef: predictionRef });

  // Real-time 30 Hz server ticks subscription (updates refs & graphics incrementally with ZERO React re-renders)
  // Everything the per-tick and per-frame systems share, in one object
  const world: MiningClientWorld = {
    ...sceneWorld,
    predictionRef,
    keysPressedRef,
    isMiningRef,
    miningTargetRef,
    currentRenderPosRef,
    targetServerPosRef,
    activeFallingRocksRef,
    activeDynamitesRef,
    droppedItemsRef,
    weaponAmmoStateRef,
    weaponSoundUrlRef,
    lastWeaponSoundTimeRef,
    cameraRef,
    fallingRocksContainerRef,
    droppedItemsContainerRef,
    dynamitesContainerRef,
    projectilesContainerRef,
    playerContainerRef,
    reticleGraphicsRef,
    debugGraphicsRef,
    droppedSpritesMap,
    fallingRockGraphicsMap,
    dynamiteGraphicsMap,
    projectileGraphicsMap,
    dynamiteTextureRef,
    projectileTexturesRef,
    blockSoundsRef,
    playerSpriteRef,
    remotePlayerRendererRef,
    mobRendererRef,
    droppedItemVisualManagerRef,
  };

  useMiningStateSync({
    onEvent,
    initialSessionState,
    playerState,
    equippedWeapon,
    soundManager,
    world,
    containersReady,
    reloadSound: reloadSoundRef.current,
    onVisionChange,
    onBackpackChange,
  });

  // 60+ FPS Frame Ticker Loop Hook
  useMiningTicker({
    app,
    world,
    soundManager,
    miningSwingSpeed: effectiveMiningSwingSpeed,
  });

  return <div className="mining-grid-container" />;
};
