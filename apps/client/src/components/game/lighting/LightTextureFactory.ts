import { Texture } from 'pixi.js';

/**
 * Factory for creating and caching procedural smooth falloff light textures.
 */
export class LightTextureFactory {
  private static radialTextures: Map<number, Texture> = new Map();

  /**
   * Get or generate a radial smooth quadratic falloff texture.
   * @param size Texture resolution in pixels (e.g. 128 or 256)
   */
  public static getRadialTexture(size: number = 128): Texture | null {
    if (this.radialTextures.has(size)) {
      return this.radialTextures.get(size)!;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const center = size / 2;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

      // Smooth multi-stop quadratic falloff
      gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.55)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.05)');
      gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      const texture = Texture.from(canvas);
      this.radialTextures.set(size, texture);
      return texture;
    } catch {
      return null;
    }
  }

  /**
   * Clear cached textures on context destruction.
   */
  public static clear(): void {
    this.radialTextures.forEach((tex) => {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    });
    this.radialTextures.clear();
  }
}
