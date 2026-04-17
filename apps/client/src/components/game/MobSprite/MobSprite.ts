import { Assets, AnimatedSprite, Spritesheet, Texture, Container } from 'pixi.js';

/**
 * MobSprite is a generic, imperative PixiJS component for rendering animated
 * mob spritesheets. It is NOT a React component—it manages raw Pixi objects
 * on a Container you supply (e.g. an Application stage).
 *
 * Usage:
 *   const mob = new MobSprite(app.stage, spriteUrl, atlasUrl);
 *   await mob.load();
 *   mob.playAnimation('Idle');
 *   // later…
 *   mob.destroy();
 */
export class MobSprite {
  private container: Container;
  private spriteUrl: string;
  private atlasUrl: string;

  private sheet: Spritesheet | null = null;
  private animatedSprite: AnimatedSprite | null = null;
  private wrapper: Container;
  private availableAnimations: string[] = [];
  private currentAnimation: string | null = null;
  private destroyed = false;

  constructor(container: Container, spriteUrl: string, atlasUrl: string) {
    this.container = container;
    this.spriteUrl = spriteUrl;
    this.atlasUrl = atlasUrl;
    this.wrapper = new Container();
    this.container.addChild(this.wrapper);
  }

  /**
   * Load the sprite texture and parse the atlas JSON.
   * Must be called before playAnimation().
   */
  async load(): Promise<void> {
    if (this.destroyed) return;

    // Load the texture
    const cacheKey = `mob_sprite_${this.spriteUrl}_${Date.now()}`;
    const texture: Texture = await Assets.load({ src: this.spriteUrl, alias: cacheKey });
    if (this.destroyed) return;

    // Fetch and patch the atlas JSON
    const response = await fetch(this.atlasUrl);
    if (!response.ok) throw new Error(`Failed to fetch atlas: ${response.status}`);
    const atlasData = await response.json();

    // Ensure meta.image points to our loaded texture source
    if (atlasData.meta) {
      atlasData.meta.image = this.spriteUrl;
    }

    const sheet = new Spritesheet(texture, atlasData);
    await sheet.parse();
    if (this.destroyed) return;

    this.sheet = sheet;

    // Collect available animation keys
    this.availableAnimations = Object.keys(sheet.animations || {});
  }

  /**
   * Play a named animation. Performs case-insensitive matching against atlas keys.
   */
  playAnimation(key: string, loop = true, speed = 0.15): void {
    if (!this.sheet || this.destroyed) return;

    // Find the matching animation key (case-insensitive)
    const matchedKey = this.findAnimationKey(key);
    if (!matchedKey) {
      console.warn(`[MobSprite] Animation "${key}" not found. Available: ${this.availableAnimations.join(', ')}`);
      return;
    }

    // Skip if already playing the same animation
    if (this.currentAnimation === matchedKey && this.animatedSprite?.playing) return;

    const frames = this.sheet.animations[matchedKey];
    if (!frames || frames.length === 0) return;

    // Remove old sprite
    if (this.animatedSprite) {
      this.animatedSprite.stop();
      this.wrapper.removeChild(this.animatedSprite);
      this.animatedSprite.destroy();
      this.animatedSprite = null;
    }

    // Create new AnimatedSprite
    const anim = new AnimatedSprite(frames);
    anim.anchor.set(0.5);
    anim.animationSpeed = speed;
    anim.loop = loop;
    anim.play();

    this.animatedSprite = anim;
    this.currentAnimation = matchedKey;
    this.wrapper.addChild(anim);
  }

  /**
   * Register a callback when a non-looping animation completes.
   */
  onAnimationComplete(callback: () => void): void {
    if (this.animatedSprite) {
      this.animatedSprite.onComplete = callback;
    }
  }

  /**
   * Get all available animation keys from the loaded spritesheet.
   */
  getAvailableAnimations(): string[] {
    return [...this.availableAnimations];
  }

  /**
   * Get the currently playing animation key, or null.
   */
  getCurrentAnimation(): string | null {
    return this.currentAnimation;
  }

  /**
   * Set the scale of the mob sprite.
   */
  setScale(scale: number): void {
    this.wrapper.scale.set(scale);
  }

  /**
   * Set the position of the mob sprite on its parent container.
   */
  setPosition(x: number, y: number): void {
    this.wrapper.x = x;
    this.wrapper.y = y;
  }

  /**
   * Get the wrapper container (useful for advanced positioning).
   */
  getContainer(): Container {
    return this.wrapper;
  }

  /**
   * Clean up all Pixi resources.
   */
  destroy(): void {
    this.destroyed = true;
    if (this.animatedSprite) {
      this.animatedSprite.stop();
      this.animatedSprite.destroy();
      this.animatedSprite = null;
    }
    if (this.wrapper.parent) {
      this.wrapper.parent.removeChild(this.wrapper);
    }
    this.wrapper.destroy({ children: true });
    this.sheet = null;
    this.currentAnimation = null;
    this.availableAnimations = [];
  }

  /**
   * Case-insensitive key lookup against available animations.
   */
  private findAnimationKey(key: string): string | null {
    // Exact match first
    if (this.availableAnimations.includes(key)) return key;

    // Case-insensitive match
    const lower = key.toLowerCase();
    return this.availableAnimations.find(k => k.toLowerCase() === lower) ?? null;
  }
}
