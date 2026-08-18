import { useEffect, useRef } from 'react';
import { Assets, Sprite, Texture, type Container } from 'pixi.js';
import { MODULAR_GEAR_SLOTS, type GearSubType } from '@mine-me/shared';
import type { CharacterJointNodes } from '../animation/ModularAnimationEngine';

export interface UseModularGearOptions {
  nodesRef: React.RefObject<CharacterJointNodes & { debugLayer: any }>;
  selectedGear?: Array<{ url: string; subType: GearSubType }>;
}

export function useModularGear({ nodesRef, selectedGear }: UseModularGearOptions) {
  const gearSpritesRef = useRef<Map<string, Sprite[]>>(new Map());

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes.root) return;

    // Clear previous gear
    gearSpritesRef.current.forEach((sprites) => {
      sprites.forEach((s) => {
        if (s.parent) s.parent.removeChild(s);
        s.destroy();
      });
    });
    gearSpritesRef.current.clear();

    if (!selectedGear || selectedGear.length === 0) return;

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
  }, [selectedGear, nodesRef]);

  return { gearSpritesRef };
}
