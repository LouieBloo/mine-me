import { Container } from 'pixi.js';
import { FloatingText, type FloatingTextOptions } from './FloatingText';

export interface FloatingTextPresetOptions extends Partial<FloatingTextOptions> {
  isCritical?: boolean;
}

/**
 * Standardized Object-Oriented Manager for floating texts and damage numbers in PixiJS v8.
 * Provides high-level convenience methods for combat damage, critical strikes, healing,
 * block damage, and status notifications while managing container lifecycle and cleanup.
 */
export class FloatingTextManager {
  private container: Container;
  private activeTexts: Set<FloatingText> = new Set();
  private isDestroyed = false;

  constructor(parentContainer?: Container) {
    this.container = new Container();
    this.container.label = 'FloatingTextLayer';
    if (parentContainer) {
      parentContainer.addChild(this.container);
    }
  }

  /**
   * Get the underlying Pixi container managing all floating texts.
   */
  public getContainer(): Container {
    return this.container;
  }

  /**
   * Spawns a floating damage number indicator (e.g. "-25").
   * Standard style: Bold bright red, black stroke, drop shadow, punch scale.
   */
  public spawnDamage(
    x: number,
    y: number,
    damage: number,
    options?: FloatingTextPresetOptions
  ): FloatingText {
    if (options?.isCritical) {
      return this.spawnCritDamage(x, y, damage, options);
    }

    const formattedDamage = `-${Math.round(damage)}`;
    return this.spawn({
      text: formattedDamage,
      x,
      y,
      color: options?.color ?? '#ef4444',
      fontSize: options?.fontSize ?? 28,
      duration: options?.duration ?? 900,
      floatDistance: options?.floatDistance ?? 50,
      punchScale: options?.punchScale ?? true,
      ...options,
    });
  }

  /**
   * Spawns a critical hit damage indicator (e.g. "CRIT! -75").
   * Style: Punchy golden yellow, larger font size, extra punch scale.
   */
  public spawnCritDamage(
    x: number,
    y: number,
    damage: number,
    options?: Partial<FloatingTextOptions>
  ): FloatingText {
    const formattedDamage = `${Math.round(damage)}!`;
    return this.spawn({
      text: formattedDamage,
      x,
      y,
      color: options?.color ?? '#facc15',
      fontSize: options?.fontSize ?? 34,
      strokeWidth: options?.strokeWidth ?? 5,
      duration: options?.duration ?? 1100,
      floatDistance: options?.floatDistance ?? 65,
      punchScale: true,
      ...options,
    });
  }

  /**
   * Spawns a healing number indicator (e.g. "+30").
   * Style: Emerald green, bold font.
   */
  public spawnHeal(
    x: number,
    y: number,
    healAmount: number,
    options?: Partial<FloatingTextOptions>
  ): FloatingText {
    const formattedHeal = `+${Math.round(healAmount)}`;
    return this.spawn({
      text: formattedHeal,
      x,
      y,
      color: options?.color ?? '#22c55e',
      fontSize: options?.fontSize ?? 28,
      duration: options?.duration ?? 1000,
      floatDistance: options?.floatDistance ?? 55,
      punchScale: options?.punchScale ?? true,
      ...options,
    });
  }

  /**
   * Spawns a block mining damage indicator (e.g. "15").
   * Style: Earthy amber-orange, slightly more compact.
   */
  public spawnBlockDamage(
    x: number,
    y: number,
    damage: number,
    options?: Partial<FloatingTextOptions>
  ): FloatingText {
    const formatted = `${Math.round(damage)}`;
    return this.spawn({
      text: formatted,
      x,
      y,
      color: options?.color ?? '#fb923c',
      fontSize: options?.fontSize ?? 22,
      duration: options?.duration ?? 750,
      floatDistance: options?.floatDistance ?? 40,
      punchScale: false,
      ...options,
    });
  }

  /**
   * Spawns a general text indicator (e.g. "MISS", "IMMUNE", "BLOCKED").
   */
  public spawnStatus(
    x: number,
    y: number,
    message: string,
    color: string = '#94a3b8',
    options?: Partial<FloatingTextOptions>
  ): FloatingText {
    return this.spawn({
      text: message,
      x,
      y,
      color,
      fontSize: options?.fontSize ?? 24,
      duration: options?.duration ?? 850,
      floatDistance: options?.floatDistance ?? 45,
      punchScale: true,
      ...options,
    });
  }

  /**
   * Core spawn method: Instantiates a FloatingText inside the managed container
   * and tracks its lifecycle.
   */
  public spawn(options: FloatingTextOptions): FloatingText {
    if (this.isDestroyed) {
      throw new Error('[FloatingTextManager] Cannot spawn text on a destroyed manager.');
    }

    const floatingText = FloatingText.spawn(this.container, options);
    this.activeTexts.add(floatingText);

    return floatingText;
  }

  /**
   * Number of currently active floating text instances.
   */
  public getActiveCount(): number {
    // Purge any destroyed items from the set
    for (const text of this.activeTexts) {
      if (text.isDestroyed()) {
        this.activeTexts.delete(text);
      }
    }
    return this.activeTexts.size;
  }

  /**
   * Immediately clears and destroys all active floating texts.
   */
  public clear(): void {
    for (const text of this.activeTexts) {
      if (!text.isDestroyed()) {
        text.destroy();
      }
    }
    this.activeTexts.clear();
  }

  /**
   * Destroys the manager, all active floating texts, and the Pixi container.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.clear();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}
