import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { usePixiStage } from '../PixiStageContext/PixiStageContext';
import { AnimatedEntitySprite } from '../sprites/AnimatedEntitySprite';
import { CompositeEntitySprite } from '../sprites/CompositeEntitySprite';
import { FloatingText } from '../sprites/FloatingText';
import type { FloatingTextOptions } from '../sprites/FloatingText';
import type { GearLayerDescriptor } from '../sprites/CompositeEntitySprite';
import { BaseSprite } from '../sprites/BaseSprite';
import './SpriteRenderer.css';

class RockSprite extends BaseSprite {
  async load(): Promise<void> {
    const graphics = new Graphics();
    graphics.rect(-50, -50, 100, 100);
    graphics.fill(0x475569); // slate-600
    graphics.stroke({ width: 4, color: 0x94a3b8 }); // slate-400 border
    this.wrapper.addChild(graphics);
  }
}

interface AnimatedSpriteProps {
  type: 'animated';
  spriteUrl: string;
  atlasUrl: string;
  animationKey?: string;
}

interface CompositeSpriteProps {
  type: 'composite';
  baseBodyUrl: string;
  gearLayers?: GearLayerDescriptor[];
  flipped?: boolean;
}

interface RockSpriteProps {
  type: 'rock';
}

type SpriteRendererProps = (AnimatedSpriteProps | CompositeSpriteProps | RockSpriteProps) & {
  width?: number;
  height?: number;
  scale?: number;
  className?: string;
  isFaded?: boolean;
};

/**
 * Imperative handle exposed via ref for controlling a SpriteRenderer.
 */
export interface SpriteRendererHandle {
  /** Spawn a floating text indicator at the center of the sprite canvas. */
  showFloatingText: (options: Omit<FloatingTextOptions, 'x' | 'y'>) => void;

  /**
   * Get the inner PixiJS container that holds the sprite visuals.
   * This is what SpriteMotion will tween for lunge animations.
   */
  getContainer: () => Container | null;

  /**
   * Get the absolute origin position within its parent container.
   * Since we use an originContainer to track DOM position, the sprite's
   * origin relative to that container is always (width/2, height/2).
   */
  getOriginPosition: () => { x: number; y: number };

  /**
   * Trigger a named animation on the underlying sprite.
   */
  playAnimation: (key: string, options?: { loop?: boolean; speed?: number; onComplete?: () => void }) => void;

  /**
   * Check if a named animation exists on the underlying sprite.
   */
  hasAnimation: (key: string) => boolean;
}

/**
 * SpriteRenderer wraps a DOM element that positions itself via standard HTML (flex/grid).
 * It then syncs a PixiJS Container's position to match this DOM element, rendering
 * the sprite inside the shared PixiStage context.
 */
export const SpriteRenderer = forwardRef<SpriteRendererHandle, SpriteRendererProps>((props, ref) => {
  const { width = 256, height = 256, scale: scaleProp, className = '' } = props;
  const { app: pixiApp, stageElement } = usePixiStage();
  const spriteRef = useRef<BaseSprite | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const originContainerRef = useRef<Container | null>(null);
  const targetAlphaRef = useRef<number>(1);

  useEffect(() => {
    targetAlphaRef.current = props.isFaded ? 0 : 1;
  }, [props.isFaded]);

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    showFloatingText: (options: Omit<FloatingTextOptions, 'x' | 'y'>) => {
      const origin = originContainerRef.current;
      if (!origin) return;
      
      // Floating text spawns relative to the originContainer
      FloatingText.spawn(origin, {
        ...options,
        x: width / 2,
        y: height / 2 - 20,
      });
    },

    getContainer: () => spriteRef.current?.getContainer() ?? null,

    getOriginPosition: () => ({ x: width / 2, y: height / 2 }),

    playAnimation: (key: string, options?: { loop?: boolean; speed?: number; onComplete?: () => void }) => {
      if (!spriteRef.current) return;
      if (spriteRef.current instanceof AnimatedEntitySprite) {
        spriteRef.current.playAnimation(key, options?.loop, options?.speed);
        if (options?.onComplete) {
          spriteRef.current.onAnimationComplete(options.onComplete);
        }
      }
    },

    hasAnimation: (key: string) => {
      if (!spriteRef.current) return false;
      if (spriteRef.current instanceof AnimatedEntitySprite) {
        return !!spriteRef.current.getAvailableAnimations().find(
          (k) => k.toLowerCase() === key.toLowerCase()
        );
      }
      return false;
    },
  }), [width, height]);

  // Load/reload the sprite AND set up position syncing in a single effect.
  // These must be in the same effect because the sync logic depends on the
  // originContainer existing, and refs don't trigger re-renders.
  useEffect(() => {
    if (!pixiApp?.stage || !stageElement || !wrapperRef.current) return;

    let active = true;

    // Create the origin container that tracks the DOM position
    const originContainer = new Container();
    pixiApp.stage.addChild(originContainer);
    originContainerRef.current = originContainer;

    // --- Position syncing ---
    const syncPosition = () => {
      const wrapperEl = wrapperRef.current;
      if (!wrapperEl || !stageElement) return;

      const wrapperRect = wrapperEl.getBoundingClientRect();
      const canvasRect = stageElement.getBoundingClientRect();

      // Top-left of the wrapper relative to the stage container
      originContainer.x = wrapperRect.left - canvasRect.left;
      originContainer.y = wrapperRect.top - canvasRect.top;
    };

    // Initial sync
    syncPosition();

    // Keep syncing on resize/layout changes
    const resizeObserver = new ResizeObserver(syncPosition);
    resizeObserver.observe(wrapperRef.current);
    resizeObserver.observe(stageElement);

    // Keep syncing position and alpha on every frame using PixiJS ticker
    const tickHandler = (ticker: any) => {
      syncPosition();

      const target = targetAlphaRef.current;
      if (originContainer && !originContainer.destroyed) {
        const delta = ticker.deltaTime || 1;
        const fadeSpeed = 0.025 * delta;
        if (originContainer.alpha < target) {
          originContainer.alpha = Math.min(target, originContainer.alpha + fadeSpeed);
        } else if (originContainer.alpha > target) {
          originContainer.alpha = Math.max(target, originContainer.alpha - fadeSpeed);
        }
      }
    };
    pixiApp.ticker.add(tickHandler);

    // --- Sprite loading ---
    const loadSprite = async () => {
      if (props.type === 'animated') {
        const sprite = new AnimatedEntitySprite(originContainer, props.spriteUrl, props.atlasUrl);
        await sprite.load();
        if (!active) {
          sprite.destroy();
          return;
        }
        sprite.setPosition(width / 2, height / 2);
        sprite.setScale(scaleProp ?? 2);
        if (props.animationKey) {
          sprite.playAnimation(props.animationKey);
        }
        spriteRef.current = sprite;
      } else if (props.type === 'composite') {
        const sprite = new CompositeEntitySprite(originContainer, props.baseBodyUrl);
        await sprite.load();
        if (!active) {
          sprite.destroy();
          return;
        }
        sprite.setPosition(width / 2, height / 2);

        const baseScale = Math.min(width / 518, height / 698) * 0.75;
        sprite.setScale(scaleProp ?? baseScale);

        if (props.flipped) {
          sprite.setFlipped(true);
        }

        if (props.gearLayers && props.gearLayers.length > 0) {
          await sprite.setGearLayers(props.gearLayers);
          if (!active) {
            sprite.destroy();
            return;
          }
        }

        spriteRef.current = sprite;
      } else if (props.type === 'rock') {
        const sprite = new RockSprite(originContainer);
        await sprite.load();
        if (!active) {
          sprite.destroy();
          return;
        }
        sprite.setPosition(width / 2, height / 2);
        sprite.setScale(scaleProp ?? 1);
        spriteRef.current = sprite;
      }

      // Re-sync after sprite load in case layout shifted
      syncPosition();
    };

    loadSprite();

    return () => {
      active = false;
      resizeObserver.disconnect();
      pixiApp.ticker.remove(tickHandler);

      if (spriteRef.current) {
        spriteRef.current.destroy();
        spriteRef.current = null;
      }
      if (originContainerRef.current) {
        if (originContainerRef.current.parent) {
          originContainerRef.current.parent.removeChild(originContainerRef.current);
        }
        originContainerRef.current.destroy({ children: true });
        originContainerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pixiApp,
    stageElement,
    props.type,
    props.type === 'animated' ? props.spriteUrl : undefined,
    props.type === 'animated' ? props.atlasUrl : undefined,
    props.type === 'composite' ? props.baseBodyUrl : undefined,
    props.type === 'composite' ? JSON.stringify(props.gearLayers) : undefined,
    props.type === 'composite' ? props.flipped : undefined,
    width,
    height,
    scaleProp,
  ]);

  // Handle animation changes without reloading the entire sprite
  useEffect(() => {
    if (props.type === 'animated' && spriteRef.current && props.animationKey) {
      (spriteRef.current as AnimatedEntitySprite).playAnimation(props.animationKey);
    }
  }, [props.type === 'animated' ? props.animationKey : undefined]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`} style={{ width, height }} />
  );
});

SpriteRenderer.displayName = 'SpriteRenderer';
