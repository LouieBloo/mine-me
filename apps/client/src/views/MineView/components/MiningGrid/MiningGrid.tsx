import React, { useEffect, useRef, useMemo } from 'react';
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
import { useMiningTicker } from './hooks/useMiningTicker';
import { TILE_SIZE } from './renderers/MiningTileRenderer';
import { DynamiteVisualManager } from './renderers/DynamiteVisualManager';
import { DroppedItemVisualManager } from './renderers/DroppedItemVisualManager';
import { ProjectileVisualManager } from './renderers/ProjectileVisualManager';
import './MiningGrid.css';

interface MiningGridProps {
  sessionState: MiningSessionClientState;
  playerState: PlayerState;
  onExit: () => void;
  onAssetsLoaded?: () => void;
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
  onWeaponAmmoChange?: (ammo: { current: number; max: number; isReloading: boolean; weaponName?: string; weaponIconUrl?: string | null } | null) => void;
}

export const MiningGrid: React.FC<MiningGridProps> = ({
  sessionState: initialSessionState,
  playerState,
  onAssetsLoaded,
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
  onWeaponAmmoChange,
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

  // Gear layers derivation
  const gearLayers: GearLayerDescriptor[] = useMemo(() => {
    if (!playerState.inventory?.items) return [];
    return playerState.inventory.items
      .filter((inv) => inv.item.type === 'GEAR' && inv.item.gearImageUrl && inv.equipped)
      .map((inv) => ({
        url: getAssetUrl(inv.item.gearImageUrl),
        subType: inv.item.subType as any,
      }));
  }, [playerState.inventory?.items]);

  // Weapon derivation for in-game mining sound effect & projectile shooting
  const equippedWeapon = useMemo(() => {
    if (playerState.gear?.weapon) {
      return playerState.gear.weapon;
    }
    if (playerState.inventory?.items) {
      const items = playerState.inventory.items;
      const equipped = items.find(
        (inv) => inv.equipped && inv.item?.type === 'GEAR' && inv.item?.subType?.toUpperCase() === 'WEAPON'
      );
      if (equipped?.item) return equipped.item;
      const anyWeapon = items.find(
        (inv) => inv.item?.type === 'GEAR' && inv.item?.subType?.toUpperCase() === 'WEAPON'
      );
      if (anyWeapon?.item) return anyWeapon.item;
      const pickaxeItem = items.find(
        (inv) => inv.item?.name?.toLowerCase().includes('pickaxe')
      );
      if (pickaxeItem?.item) return pickaxeItem.item;
    }
    return null;
  }, [playerState.gear?.weapon, playerState.inventory?.items]);

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
    bulletTextureRef,
    bulletScaleRef,
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
  const { weaponSoundUrlRef, weaponAmmoStateRef, handleWeaponReload } = useMiningActions({
    playerState,
    equippedWeapon,
    mouseControllerRef,
    gridRef,
    playerBodyRef,
    tilesContainerRef,
    containersReady,
    blockTexturesRef,
    tileGraphicsMap,
    tileSpritesMap,
    dynamiteVisualManagerRef,
    projectileVisualManagerRef,
    activeProjectilesRef,
    particleEngineRef,
    lightingEngineRef,
    dynamicItemsRef,
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
    onWeaponAmmoChange,
  });

  // Real-time Input Controls Hook (Keyboard movement, debug toggle, camera zoom, flashlight toggle, weapon reload)
  const { keysPressedRef } = useMiningInput({
    sendGameEvent,
    playerSpriteRef,
    flashlightRef,
    showDebugRef,
    onToggleDebug,
    playerFacingDirRef,
    isFacingLeftRef,
    mouseControllerRef,
    zoom,
    onZoomChange,
    onVisionChange,
    onReload: handleWeaponReload,
  });

  // Initial Full-Grid Render & Initial Dynamic Ambient Tile Lights/Emitters
  useMiningAmbientEffects({
    containersReady,
    tileTextureLoaded,
    tilesContainerRef,
    gridRef,
    blockTexturesRef,
    tileGraphicsMap,
    tileSpritesMap,
    lightingEngineRef,
    particleEngineRef,
    blockParticleConfigsRef,
    torchEmittersRef,
    blockEmittersRef,
  });

  // Real-time 30 Hz server ticks subscription (updates refs & graphics incrementally with ZERO React re-renders)
  useMiningStateSync({
    onEvent,
    playerState,
    equippedWeapon,
    soundManager,
    gridRef,
    playerBodyRef,
    targetServerPosRef,
    isMiningRef,
    miningTargetRef,
    activeFallingRocksRef,
    activeDynamitesRef,
    activeProjectilesRef,
    droppedItemsRef,
    weaponAmmoStateRef,
    weaponSoundUrlRef,
    mouseControllerRef,
    tilesContainerRef,
    droppedItemsContainerRef,
    containersReady,
    blockTexturesRef,
    tileGraphicsMap,
    tileSpritesMap,
    droppedSpritesMap,
    remotePlayerRendererRef,
    mobRendererRef,
    lightingEngineRef,
    particleEngineRef,
    blockParticleConfigsRef,
    blockSoundsRef,
    torchEmittersRef,
    blockEmittersRef,
    dynamiteVisualManagerRef,
    projectileVisualManagerRef,
    droppedItemVisualManagerRef,
    onVisionChange,
    onBackpackChange,
    onWeaponAmmoChange,
  });

  // 60+ FPS Frame Ticker Loop Hook
  useMiningTicker({
    app,
    playerContainerRef,
    gridContainerRef,
    fallingRocksContainerRef,
    currentRenderPosRef,
    targetServerPosRef,
    isFacingLeftRef,
    playerFacingDirRef,
    playerSpriteRef,
    remotePlayerRendererRef,
    mobRendererRef,
    activeFallingRocksRef,
    fallingRockGraphicsMap,
    dynamitesContainerRef,
    activeDynamitesRef,
    dynamiteGraphicsMap,
    dynamiteTextureRef,
    dynamiteVisualManagerRef,
    projectilesContainerRef,
    activeProjectilesRef,
    projectileGraphicsMap,
    bulletTextureRef,
    bulletScaleRef,
    projectileVisualManagerRef,
    droppedItemVisualManagerRef,
    droppedItemsRef,
    reticleGraphicsRef,
    mouseControllerRef,
    debugGraphicsRef,
    showDebugRef,
    flashlightRef,
    lightingEngineRef,
    cameraRef,
    particleEngineRef,
    playerBodyRef,
    gridRef,
    keysPressedRef,
    isMiningRef,
    miningTargetRef,
    blockTexturesRef,
    soundManager,
    weaponSoundUrlRef,
  });

  return <div className="mining-grid-container" />;
};
