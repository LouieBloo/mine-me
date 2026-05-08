import { Container, Text, TextStyle, Ticker } from 'pixi.js';

/**
 * Configuration options for a floating text indicator.
 */
export interface FloatingTextOptions {
  /** The text to display (e.g. "-15", "+20") */
  text: string;
  /** Spawn X position relative to the parent container */
  x: number;
  /** Spawn Y position relative to the parent container */
  y: number;
  /** Text color as a hex string (e.g. '#ff4444') — default red */
  color?: string;
  /** Font size in pixels — default 28 */
  fontSize?: number;
  /** Animation duration in milliseconds — default 1000 */
  duration?: number;
  /** Distance in pixels to float upward — default 60 */
  floatDistance?: number;
  /** Font family — default 'Inter, sans-serif' */
  fontFamily?: string;
  /** Stroke/outline color for readability against backgrounds — default '#000000' */
  strokeColor?: string;
  /** Stroke/outline thickness — default 4 */
  strokeWidth?: number;
  /** If true, the text scales up with a punch effect — default true */
  punchScale?: boolean;
}

/**
 * FloatingText is a reusable PixiJS component that spawns an animated text
 * indicator that floats upward and fades out. Commonly used for damage numbers,
 * healing indicators, and status effects in combat.
 *
 * Usage:
 *   FloatingText.spawn(container, { text: '-15', x: 100, y: 80, color: '#ff4444' });
 *
 * The text auto-destroys after the animation completes — no cleanup needed.
 */
export class FloatingText {
  private textObj: Text;
  private parentContainer: Container;
  private startY: number;
  private elapsed = 0;
  private duration: number;
  private floatDistance: number;
  private punchScale: boolean;
  private destroyed = false;

  /**
   * Static factory — the primary way to create floating text.
   * Spawns the text, starts the animation, and auto-cleans-up.
   */
  static spawn(parentContainer: Container, options: FloatingTextOptions): FloatingText {
    return new FloatingText(parentContainer, options);
  }

  constructor(parentContainer: Container, options: FloatingTextOptions) {
    this.parentContainer = parentContainer;
    this.duration = options.duration ?? 1000;
    this.floatDistance = options.floatDistance ?? 60;
    this.startY = options.y;
    this.punchScale = options.punchScale ?? true;

    const style = new TextStyle({
      fontFamily: options.fontFamily ?? 'Inter, sans-serif',
      fontSize: options.fontSize ?? 28,
      fontWeight: 'bold',
      fill: options.color ?? '#ff4444',
      stroke: {
        color: options.strokeColor ?? '#000000',
        width: options.strokeWidth ?? 4,
      },
      dropShadow: {
        alpha: 0.4,
        angle: Math.PI / 4,
        blur: 2,
        distance: 2,
        color: '#000000',
      },
    });

    this.textObj = new Text({ text: options.text, style });
    this.textObj.anchor.set(0.5);
    this.textObj.x = options.x;
    this.textObj.y = options.y;

    // Add small random X offset so overlapping numbers don't stack perfectly
    this.textObj.x += (Math.random() - 0.5) * 20;

    this.parentContainer.addChild(this.textObj);

    // Start animation via shared ticker
    Ticker.shared.add(this.onTick, this);
  }

  /**
   * Per-frame animation callback.
   * Easing: starts fast, decelerates. Alpha fades out in the last 40%.
   */
  private onTick = (): void => {
    if (this.destroyed) return;

    const dt = Ticker.shared.deltaMS;
    this.elapsed += dt;

    const progress = Math.min(this.elapsed / this.duration, 1);

    // Ease-out cubic for smooth deceleration
    const eased = 1 - Math.pow(1 - progress, 3);

    // Float upward
    this.textObj.y = this.startY - this.floatDistance * eased;

    // Alpha: full opacity for first 60%, then fade out
    if (progress < 0.6) {
      this.textObj.alpha = 1;
    } else {
      this.textObj.alpha = 1 - ((progress - 0.6) / 0.4);
    }

    // Punch scale: start at 1.4x and settle to 1x over first 30%
    if (this.punchScale) {
      if (progress < 0.3) {
        const scaleProgress = progress / 0.3;
        const scaleEased = 1 - Math.pow(1 - scaleProgress, 2);
        this.textObj.scale.set(1.4 - 0.4 * scaleEased);
      } else {
        this.textObj.scale.set(1);
      }
    }

    // Finished
    if (progress >= 1) {
      this.destroy();
    }
  };

  /**
   * Clean up the text object and remove the ticker listener.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    Ticker.shared.remove(this.onTick, this);

    if (this.textObj.parent) {
      this.textObj.parent.removeChild(this.textObj);
    }
    this.textObj.destroy();
  }

  /** Whether this floating text has been destroyed. */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Get the underlying PixiJS Text object (for testing). */
  getTextObject(): Text {
    return this.textObj;
  }
}
