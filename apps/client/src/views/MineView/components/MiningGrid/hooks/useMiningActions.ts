import { useEffect, useRef, useState } from 'react';
import type { GameItem, PlayerState, MiningActiveProjectile } from '@mine-me/shared';
import {
  DEFAULT_DYNAMITE_SOUNDS,
  getAssetUrl,
  MiningTileType,
} from '@mine-me/shared';
import { notificationService } from '../../../../../services/notificationService';
import { MiningTileRenderer, TILE_SIZE } from '../renderers/MiningTileRenderer';
import {
  TorchPlacementAction,
  LadderPlacementAction,
  ThrowableItemAction,
  ShootWeaponAction,
} from '../input/MouseAction';
import type { MiningMouseController } from '../input/MiningMouseController';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { SoundManager } from '../../../../../services/sound';
import type { MiningPlayerBody, MiningClientTile } from '@mine-me/shared';
import type { Container, Texture, Graphics, Sprite } from 'pixi.js';

export interface UseMiningActionsOptions {
  playerState: PlayerState;
  equippedWeapon: any;
  playerSpriteRef?: React.RefObject<ModularCharacterSprite | null>;
  gridContainerRef?: React.RefObject<Container | null>;
  mouseControllerRef: React.MutableRefObject<MiningMouseController>;
  gridRef: React.MutableRefObject<MiningClientTile[][]>;
  playerBodyRef: React.MutableRefObject<MiningPlayerBody>;
  tilesContainerRef: React.RefObject<Container | null>;
  containersReady: boolean;
  blockTexturesRef: React.MutableRefObject<Map<number, Texture>>;
  tileGraphicsMap: React.MutableRefObject<Map<string, Graphics>>;
  tileSpritesMap: React.MutableRefObject<Map<string, Sprite>>;
  dynamiteVisualManagerRef: React.RefObject<DynamiteVisualManager | null>;
  projectileVisualManagerRef: React.RefObject<ProjectileVisualManager | null>;
  activeProjectilesRef?: React.MutableRefObject<MiningActiveProjectile[]>;
  particleEngineRef: React.RefObject<ParticleEngine | null>;
  lightingEngineRef: React.RefObject<LightingEngine | null>;
  dynamicItemsRef?: React.MutableRefObject<any[]>;
  soundManager: SoundManager;
  sendGameEvent: (event: any) => Promise<any>;

  isPlacingTorch?: boolean;
  onTorchPlaced?: () => void;
  isPlacingLadder?: boolean;
  onLadderPlaced?: () => void;
  isThrowingDynamite?: boolean;
  isThrowingItem?: boolean;
  activeThrowableItem?: GameItem | null;
  onDynamiteThrown?: () => void;
}

export function useMiningActions({
  playerState,
  equippedWeapon,
  playerSpriteRef,
  gridContainerRef,
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
  isPlacingTorch = false,
  onTorchPlaced,
  isPlacingLadder = false,
  onLadderPlaced,
  isThrowingDynamite = false,
  isThrowingItem = false,
  activeThrowableItem = null,
  onDynamiteThrown,
}: UseMiningActionsOptions) {
  const [resolvedSoundUrl, setResolvedSoundUrl] = useState<string | null>(
    equippedWeapon?.soundEffects?.shoot?.url || equippedWeapon?.soundEffectUrl || null
  );

  useEffect(() => {
    const soundUrl = equippedWeapon?.soundEffects?.shoot?.url || equippedWeapon?.soundEffectUrl;
    if (soundUrl) {
      setResolvedSoundUrl(soundUrl);
      return;
    }
    if (equippedWeapon?.id) {
      fetch(getAssetUrl('/api/public/items?type=GEAR'))
        .then((res) => (res.ok ? res.json() : []))
        .then((items: any[]) => {
          const found = items.find((i: any) => i.id === equippedWeapon.id);
          const foundSound = found?.soundEffects?.shoot?.url || found?.soundEffectUrl;
          if (foundSound) {
            setResolvedSoundUrl(foundSound);
          }
        })
        .catch(() => {});
    }
  }, [equippedWeapon?.id, equippedWeapon?.soundEffectUrl, equippedWeapon?.soundEffects?.shoot?.url]);

  const weaponSoundUrlRef = useRef<string | null>(resolvedSoundUrl);
  weaponSoundUrlRef.current = resolvedSoundUrl;

  const weaponAmmoStateRef = useRef<{ current: number; max: number; isReloading: boolean }>({
    current: equippedWeapon?.projectileConfig?.magazineSize ?? 6,
    max: equippedWeapon?.projectileConfig?.magazineSize ?? 6,
    isReloading: false,
  });

  const handleWeaponReload = async () => {
    if (!equippedWeapon) return;
    const weapon = equippedWeapon;
    const maxAmmo = weapon?.projectileConfig?.magazineSize ?? 6;
    if (weaponAmmoStateRef.current.isReloading || weaponAmmoStateRef.current.current >= maxAmmo) {
      return;
    }
    try {
      const reloadSoundUrl = weapon?.soundEffects?.reload?.url;
      if (reloadSoundUrl) {
        soundManager.playSfx?.(reloadSoundUrl);
      }

      weaponAmmoStateRef.current.isReloading = true;

      const res: any = await sendGameEvent({
        type: 'mining_reload',
        weaponItemId: weapon.id,
      });

      const ammoData = res?.data ?? res;
      if (typeof ammoData?.remainingAmmo === 'number') {
        weaponAmmoStateRef.current = {
          current: ammoData.remainingAmmo,
          max: maxAmmo,
          isReloading: ammoData.isReloading ?? false,
        };
      }
    } catch (err: any) {
      console.error('[MiningGrid] mining_reload error:', err);
      weaponAmmoStateRef.current.isReloading = false;
    }
  };

  useEffect(() => {
    const mouseController = mouseControllerRef.current;
    if (isPlacingTorch) {
      const torchItem = playerState?.inventory?.items?.find(
        (inv: any) =>
          inv.item?.subType?.toUpperCase() === 'TORCH' ||
          inv.item?.name?.toLowerCase().includes('torch')
      )?.item;

      mouseController.setActiveAction(
        new TorchPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_torch', target });
            if (res.success) {
              const tile = gridRef.current[target.y]?.[target.x];
              if (tile) {
                tile.type = MiningTileType.TORCH;
                tile.revealed = true;
                tile.damageStage = 0;
              }
              const tilesContainer = tilesContainerRef.current;
              if (tilesContainer && containersReady) {
                MiningTileRenderer.updateRevealedTiles(
                  tilesContainer,
                  [{ x: target.x, y: target.y, type: MiningTileType.TORCH }],
                  gridRef.current,
                  blockTexturesRef.current,
                  tileGraphicsMap.current,
                  tileSpritesMap.current,
                  TILE_SIZE
                );
              }
              onTorchPlaced?.();
              return true;
            } else {
              notificationService.error('Cannot Place Torch', res.error || 'Invalid placement position.');
              return false;
            }
          } catch (err: any) {
            console.error('[MiningGrid] mining_place_torch error:', err);
            notificationService.error('Error', err.message || 'Failed to place torch.');
            return false;
          }
        }, torchItem?.triggerMode)
      );
    } else if (isPlacingLadder) {
      const ladderItem = playerState?.inventory?.items?.find(
        (inv: any) =>
          inv.item?.subType?.toUpperCase() === 'LADDER' ||
          inv.item?.name?.toLowerCase().includes('ladder')
      )?.item;

      mouseController.setActiveAction(
        new LadderPlacementAction(async (target) => {
          try {
            const res = await sendGameEvent({ type: 'mining_place_ladder', target });
            if (res.success) {
              const tile = gridRef.current[target.y]?.[target.x];
              if (tile) {
                tile.type = MiningTileType.LADDER;
                tile.revealed = true;
                tile.damageStage = 0;
              }
              const tilesContainer = tilesContainerRef.current;
              if (tilesContainer && containersReady) {
                MiningTileRenderer.updateRevealedTiles(
                  tilesContainer,
                  [{ x: target.x, y: target.y, type: MiningTileType.LADDER }],
                  gridRef.current,
                  blockTexturesRef.current,
                  tileGraphicsMap.current,
                  tileSpritesMap.current,
                  TILE_SIZE
                );
              }
              onLadderPlaced?.();
              return true;
            } else {
              notificationService.error('Cannot Place Ladder', res.error || 'Invalid placement position.');
              return false;
            }
          } catch (err: any) {
            console.error('[MiningGrid] mining_place_ladder error:', err);
            notificationService.error('Error', err.message || 'Failed to place ladder.');
            return false;
          }
        }, ladderItem?.triggerMode)
      );
    } else if (isThrowingItem || isThrowingDynamite) {
      const targetItem =
        activeThrowableItem ||
        playerState?.inventory?.items?.find(
          (inv: any) =>
            inv.item?.throwable === true ||
            inv.item?.subType?.toUpperCase() === 'DYNAMITE' ||
            inv.item?.name?.toLowerCase().includes('dynamite')
        )?.item;

      mouseController.setActiveAction(
        new ThrowableItemAction({
          name: targetItem ? `throw_${targetItem.name.toLowerCase().replace(/\s+/g, '_')}` : 'throw_dynamite',
          itemId: targetItem?.id,
          physicsConfig: (targetItem as any)?.physicsConfig,
          triggerMode: targetItem?.triggerMode,
          onThrow: async (target, forceRatio) => {
            try {
              const res = await sendGameEvent({
                type: 'mining_throw_dynamite',
                target,
                forceRatio,
                itemId: targetItem?.id,
              } as any);
              if (res.success) {
                const throwSoundUrl =
                  targetItem?.soundEffects?.throw?.url ||
                  targetItem?.soundEffectUrl ||
                  DEFAULT_DYNAMITE_SOUNDS.throw?.url;
                if (throwSoundUrl) {
                  soundManager.playSfx(throwSoundUrl);
                }
                dynamiteVisualManagerRef.current?.recordLocalThrow();
                onDynamiteThrown?.();
                return true;
              } else {
                notificationService.error('Cannot Throw Item', res.error || 'Failed to throw item.');
                return false;
              }
            } catch (err: any) {
              console.error('[MiningGrid] mining_throw_dynamite error:', err);
              notificationService.error('Error', err.message || 'Failed to throw item.');
              return false;
            }
          },
        })
      );
    } else if (equippedWeapon?.shootsProjectiles || (equippedWeapon as any)?.projectileConfig) {
      const weapon = equippedWeapon;
      if (!weapon) return;
      const projConfig = (weapon as any)?.projectileConfig || {
        magazineSize: 6,
        fireRate: 2.5,
        reloadTime: 1.5,
      };
      const fireRate = projConfig.fireRate ?? 2.5;

      mouseController.setActiveAction(
        new ShootWeaponAction({
          name: `shoot_${weapon.name.toLowerCase().replace(/\s+/g, '_')}`,
          weaponItemId: weapon.id,
          fireRate,
          triggerMode: weapon.triggerMode,
          onShoot: async (target) => {
            if (weaponAmmoStateRef.current.isReloading) {
              return false;
            }

            if (weaponAmmoStateRef.current.current <= 0) {
              handleWeaponReload();
              return false;
            }

            const playerPos = playerBodyRef.current.position;
            const gridContainer = gridContainerRef?.current;
            const sprite = playerSpriteRef?.current;
            const dbWeapon = dynamicItemsRef?.current?.find(
              (i: any) => i.id === weapon.id || (i.itemKey && i.itemKey === weapon.itemKey)
            );
            const mOffsetX = weapon.muzzleOffsetX ?? dbWeapon?.muzzleOffsetX ?? 0;
            const mOffsetY = weapon.muzzleOffsetY ?? dbWeapon?.muzzleOffsetY ?? 0;

            let muzzlePos = {
              x: playerPos.x,
              y: playerPos.y - 0.45,
            };

            if (gridContainer && sprite) {
              const muzzleLocal = sprite.getMuzzleWorldPosition(gridContainer, {
                x: mOffsetX,
                y: mOffsetY,
              });
              if (muzzleLocal) {
                muzzlePos = {
                  x: muzzleLocal.x / TILE_SIZE,
                  y: muzzleLocal.y / TILE_SIZE,
                };
              }
            }

            // Compute bullet trajectory from muzzle launch point directly towards cursor target
            const dx = target.x - muzzlePos.x;
            const dy = target.y - muzzlePos.y;
            const dist = Math.hypot(dx, dy) || 1.0;
            const dirX = dx / dist;
            const dirY = dy / dist;
            const angle = Math.atan2(dy, dx);

            const gunshotSound =
              weapon.soundEffects?.shoot?.url ||
              weapon.soundEffectUrl ||
              weaponSoundUrlRef.current ||
              null;

            projectileVisualManagerRef.current?.triggerLocalShot(
              muzzlePos,
              angle,
              gunshotSound,
              particleEngineRef.current,
              lightingEngineRef.current,
              soundManager,
              TILE_SIZE
            );

            // Trigger visual kickback recoil impulse on the aiming arm
            playerSpriteRef?.current?.triggerRecoil(0.22);

            const bulletSpeed = projConfig.projectileSpeed ?? 28.0;
            const clientBulletId = `client_proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

            const projItem = dynamicItemsRef?.current?.find(
              (i: any) => i.id === projConfig.projectileItemId || i.itemKey === projConfig.projectileItemId
            );
            const bulletScale = typeof projItem?.inGameScale === 'number' && projItem.inGameScale > 0
              ? projItem.inGameScale
              : 1.0;

            const clientBullet: any = {
              id: clientBulletId,
              characterId: playerState?.id,
              itemId: projConfig.projectileItemId,
              position: { x: muzzlePos.x, y: muzzlePos.y },
              spawnPosition: { x: muzzlePos.x, y: muzzlePos.y },
              velocity: { x: dirX * bulletSpeed, y: dirY * bulletSpeed },
              angle,
              speed: bulletSpeed,
              distanceTraveled: 0,
              lifeTime: 0,
              spriteUrl: projItem?.inGameSpriteUrl || projItem?.iconUrl || null,
              inGameScale: bulletScale,
            };

            if (activeProjectilesRef?.current) {
              activeProjectilesRef.current.push(clientBullet);
            }

            weaponAmmoStateRef.current = {
              ...weaponAmmoStateRef.current,
              current: Math.max(0, weaponAmmoStateRef.current.current - 1),
            };

            try {
              const res: any = await sendGameEvent({
                type: 'mining_shoot',
                target,
                weaponItemId: weapon.id,
                muzzlePosition: muzzlePos,
              });

              const ammoData = res?.data ?? res;
              if (typeof ammoData?.remainingAmmo === 'number') {
                weaponAmmoStateRef.current = {
                  current: ammoData.remainingAmmo,
                  max: projConfig.magazineSize ?? 6,
                  isReloading: ammoData.isReloading ?? false,
                };
              }

              if (weaponAmmoStateRef.current.current <= 0 && !weaponAmmoStateRef.current.isReloading) {
                handleWeaponReload();
              }
              return true;
            } catch (err: any) {
              console.error('[MiningGrid] mining_shoot error:', err);
              return false;
            }
          },
        })
      );
    } else {
      mouseController.setActiveAction(null);
    }
  }, [
    isPlacingTorch,
    isPlacingLadder,
    isThrowingItem,
    isThrowingDynamite,
    activeThrowableItem,
    equippedWeapon,
    containersReady,
    playerState?.inventory?.items,
  ]);

  return {
    weaponSoundUrlRef,
    weaponAmmoStateRef,
    handleWeaponReload,
  };
}
