import { useEffect, useRef } from 'react';
import { Assets, Sprite, Texture, Graphics, type Container } from 'pixi.js';
import { MODULAR_GEAR_SLOTS, type GearSubType, type ParticleEffectConfig } from '@mine-me/shared';
import type { CharacterJointNodes } from '../animation/ModularAnimationEngine';

export interface ModularGearItem {
  url: string;
  subType: GearSubType;
  holdOffsetX?: number;
  holdOffsetY?: number;
  holdRotation?: number; // in degrees
  muzzleOffsetX?: number;
  muzzleOffsetY?: number;
  shootsProjectiles?: boolean;
  /** Effect the held item emits and where (weapon-sprite local space); drawn as a marker and emitted live in the preview. */
  heldParticle?: HeldParticlePreview | null;
  /** Origin of the light the held item gives off; drawn as a marker (the admin has no lighting). */
  heldLight?: HeldLightPreview | null;
}

export interface HeldParticlePreview {
  config: ParticleEffectConfig;
  offsetX: number;
  offsetY: number;
}

export const PARTICLE_MARKER_LABEL = 'particle_marker';
export const LIGHT_MARKER_LABEL = 'light_marker';

export interface HeldLightPreview {
  offsetX: number;
  offsetY: number;
}

/** Shows (or hides) a crosshair marker on the weapon sprite at the given origin. */
function syncOriginMarker(sprite: Sprite, label: string, color: number, origin: { offsetX: number; offsetY: number } | null | undefined): void {
  let marker = sprite.getChildByLabel(label) as Graphics | null;
  if (!origin) {
    if (marker) marker.visible = false;
    return;
  }
  if (!marker) {
    marker = new Graphics();
    marker.label = label;
    marker.circle(0, 0, 9);
    marker.stroke({ color, width: 2, alpha: 0.95 });
    marker.circle(0, 0, 3);
    marker.fill({ color: 0xffffff });
    marker.moveTo(-16, 0);
    marker.lineTo(16, 0);
    marker.moveTo(0, -16);
    marker.lineTo(0, 16);
    marker.stroke({ color, width: 1.5, alpha: 0.9 });
    sprite.addChild(marker);
  }
  marker.visible = true;
  marker.x = origin.offsetX;
  marker.y = origin.offsetY;
}

/** Amber marker for the held particle origin. */
export function syncParticleMarker(sprite: Sprite, heldParticle: HeldParticlePreview | null | undefined): void {
  syncOriginMarker(sprite, PARTICLE_MARKER_LABEL, 0xf59e0b, heldParticle);
}

/** Blue marker for the held light origin. */
export function syncLightMarker(sprite: Sprite, heldLight: HeldLightPreview | null | undefined): void {
  syncOriginMarker(sprite, LIGHT_MARKER_LABEL, 0x38bdf8, heldLight);
}

export interface UseModularGearOptions {
  nodesRef: React.RefObject<CharacterJointNodes & { debugLayer: any }>;
  selectedGear?: ModularGearItem[];
  isSceneReady?: boolean;
}

export function useModularGear({ nodesRef, selectedGear, isSceneReady }: UseModularGearOptions) {
  const gearSpritesRef = useRef<Map<string, Sprite[]>>(new Map());
  const lastLoadedUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes.root) return;

    if (!selectedGear || selectedGear.length === 0) {
      gearSpritesRef.current.forEach((sprites) => {
        sprites.forEach((s) => {
          if (s.parent) s.parent.removeChild(s);
          s.destroy();
        });
      });
      gearSpritesRef.current.clear();
      lastLoadedUrlsRef.current.clear();
      return;
    }

    // Fast-path: If the weapon sprite is already loaded with the same URL, update offsets directly for 60fps slider dragging
    const currentWeaponSprites = gearSpritesRef.current.get('WEAPON');
    const weaponGear = selectedGear.find((g) => g.subType === 'WEAPON');
    if (
      currentWeaponSprites &&
      currentWeaponSprites.length === 1 &&
      weaponGear &&
      lastLoadedUrlsRef.current.get('WEAPON') === weaponGear.url
    ) {
      const s = currentWeaponSprites[0];
      s.x = weaponGear.holdOffsetX ?? 0;
      s.y = weaponGear.holdOffsetY ?? 0;
      s.rotation = ((weaponGear.holdRotation ?? 0) * Math.PI) / 180;

      const marker = s.getChildByLabel('muzzle_marker') as Graphics | null;
      if (weaponGear.shootsProjectiles) {
        if (marker) {
          marker.visible = true;
          marker.x = weaponGear.muzzleOffsetX ?? 0;
          marker.y = weaponGear.muzzleOffsetY ?? 0;
        } else {
          const muzzleGfx = new Graphics();
          muzzleGfx.label = 'muzzle_marker';
          muzzleGfx.circle(0, 0, 9);
          muzzleGfx.stroke({ color: 0xef4444, width: 2, alpha: 0.9 });
          muzzleGfx.circle(0, 0, 3);
          muzzleGfx.fill({ color: 0xffffff });
          muzzleGfx.moveTo(-16, 0);
          muzzleGfx.lineTo(16, 0);
          muzzleGfx.moveTo(0, -16);
          muzzleGfx.lineTo(0, 16);
          muzzleGfx.stroke({ color: 0xef4444, width: 1.5, alpha: 0.85 });
          muzzleGfx.x = weaponGear.muzzleOffsetX ?? 0;
          muzzleGfx.y = weaponGear.muzzleOffsetY ?? 0;
          s.addChild(muzzleGfx);
        }
      } else if (marker) {
        marker.visible = false;
      }
      syncParticleMarker(s, weaponGear.heldParticle);
      syncLightMarker(s, weaponGear.heldLight);
      return;
    }

    // Clear previous gear
    gearSpritesRef.current.forEach((sprites) => {
      sprites.forEach((s) => {
        if (s.parent) s.parent.removeChild(s);
        s.destroy();
      });
    });
    gearSpritesRef.current.clear();
    lastLoadedUrlsRef.current.clear();

    let active = true;
    const loadGear = async () => {
      for (const gear of selectedGear) {
        if (!active) return;
        try {
          const cacheKey = `admin_gear_${gear.url}_${Date.now()}`;
          const texture: Texture = await Assets.load({ src: gear.url, alias: cacheKey });
          if (!active) return;

          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);

          // Normalize weapons/tools so they scale proportionally to character body parts
          if (gear.subType === 'WEAPON') {
            const targetToolDimension = 280;
            const maxDim = Math.max(texture.width, texture.height);
            if (maxDim > targetToolDimension) {
              const toolScale = targetToolDimension / maxDim;
              sprite.scale.set(toolScale);
            }

            sprite.x = gear.holdOffsetX ?? 0;
            sprite.y = gear.holdOffsetY ?? 0;
            sprite.rotation = ((gear.holdRotation ?? 0) * Math.PI) / 180;

            if (gear.shootsProjectiles) {
              const muzzleGfx = new Graphics();
              muzzleGfx.label = 'muzzle_marker';
              muzzleGfx.circle(0, 0, 9);
              muzzleGfx.stroke({ color: 0xef4444, width: 2, alpha: 0.9 });
              muzzleGfx.circle(0, 0, 3);
              muzzleGfx.fill({ color: 0xffffff });
              muzzleGfx.moveTo(-16, 0);
              muzzleGfx.lineTo(16, 0);
              muzzleGfx.moveTo(0, -16);
              muzzleGfx.lineTo(0, 16);
              muzzleGfx.stroke({ color: 0xef4444, width: 1.5, alpha: 0.85 });
              muzzleGfx.x = gear.muzzleOffsetX ?? 0;
              muzzleGfx.y = gear.muzzleOffsetY ?? 0;
              sprite.addChild(muzzleGfx);
            }
            syncParticleMarker(sprite, gear.heldParticle);
            syncLightMarker(sprite, gear.heldLight);
          }

          const slotNodeName = MODULAR_GEAR_SLOTS[gear.subType] || 'torso';
          let targetNode: Container | null = null;
          if (slotNodeName === 'headNode') targetNode = nodes.head;
          else if (slotNodeName === 'torsoNode') targetNode = nodes.torso;
          else if (slotNodeName === 'legFrontNode') targetNode = nodes.legFront;
          else if (slotNodeName === 'toolSocket') targetNode = nodes.toolSocket;
          else targetNode = nodes.torso;

          if (targetNode) {
            targetNode.addChild(sprite);
            const list = gearSpritesRef.current.get(gear.subType) || [];
            list.push(sprite);
            gearSpritesRef.current.set(gear.subType, list);
            lastLoadedUrlsRef.current.set(gear.subType, gear.url);
          }
        } catch (e) {
          console.warn(`[ModularCharacterCanvas] Could not load gear layer ${gear.url}:`, e);
        }
      }
    };

    loadGear();

    return () => {
      active = false;
    };
  }, [selectedGear, nodesRef, isSceneReady]);

  return { gearSpritesRef };
}
