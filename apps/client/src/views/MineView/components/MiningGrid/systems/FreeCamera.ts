import type { Vector2D } from '@mine-me/shared';

/** Which keys pan the free camera. */
const KEY_DIRECTIONS: Record<string, keyof FreeCameraKeys> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

interface FreeCameraKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * A camera that is detached from the player: it pans with WASD/arrows or by dragging, and the
 * character is left alone. The world is in pixels, like the Camera2D it drives.
 */
export class FreeCamera {
  /** Pan speed with a key held, in screen pixels per second. */
  public static readonly KEY_SPEED = 900;

  private _active = false;
  private position: Vector2D = { x: 0, y: 0 };
  private keys: FreeCameraKeys = { up: false, down: false, left: false, right: false };

  public get active(): boolean {
    return this._active;
  }

  /** Detaches the camera, starting from where it is now. */
  public enable(from: Vector2D): void {
    this._active = true;
    this.position = { x: from.x, y: from.y };
    this.releaseKeys();
  }

  /** Re-attaches the camera to the player. */
  public disable(): void {
    this._active = false;
    this.releaseKeys();
  }

  public releaseKeys(): void {
    this.keys = { up: false, down: false, left: false, right: false };
  }

  /** Feeds a key event. Returns true if the key is a pan key (so the caller can stop handling it). */
  public handleKey(key: string, isDown: boolean): boolean {
    if (!this._active) return false;
    const dir = KEY_DIRECTIONS[key.toLowerCase()];
    if (!dir) return false;
    this.keys[dir] = isDown;
    return true;
  }

  /** Drags the world with the cursor: the camera moves opposite to the drag, scaled by the zoom. */
  public dragBy(screenDx: number, screenDy: number, zoom: number): void {
    if (!this._active || !(zoom > 0)) return;
    this.position.x -= screenDx / zoom;
    this.position.y -= screenDy / zoom;
  }

  /** Moves for a frame and returns where the camera looks (world pixels), kept inside `bounds` if given. */
  public update(dt: number, zoom: number, bounds?: { width: number; height: number }): Vector2D {
    if (this._active && zoom > 0) {
      const dx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      const dy = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        const step = (FreeCamera.KEY_SPEED * dt) / zoom;
        this.position.x += (dx / len) * step;
        this.position.y += (dy / len) * step;
      }
    }
    if (bounds) {
      this.position.x = Math.min(bounds.width, Math.max(0, this.position.x));
      // Allow looking up into the sky a little, but not far past the bottom
      this.position.y = Math.min(bounds.height, Math.max(-400, this.position.y));
    }
    return { x: this.position.x, y: this.position.y };
  }
}
