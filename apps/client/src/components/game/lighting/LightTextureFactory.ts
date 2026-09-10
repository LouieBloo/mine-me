import { Texture } from 'pixi.js';

/**
 * Factory for creating and caching procedural smooth falloff light textures.
 */
export class LightTextureFactory {
  private static radialTextures: Map<number, Texture> = new Map();
  private static coneTextures: Map<string, Texture> = new Map();

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
   * Get or generate a directional flashlight beam texture with soft angular and distance falloff.
   * Cone points horizontally along positive X with apex at (0, size / 2).
   * @param size Texture resolution in pixels (e.g. 256)
   * @param coneAngleDeg Full beam cone angle in degrees (e.g. 75)
   */
  public static getConeTexture(size: number = 256, coneAngleDeg: number = 75): Texture | null {
    const key = `${size}_${Math.round(coneAngleDeg)}`;
    if (this.coneTextures.has(key)) {
      return this.coneTextures.get(key)!;
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

      const imgData = ctx.createImageData(size, size);
      const data = imgData.data;

      const apexX = 0;
      const apexY = size / 2;
      const radius = size;
      const halfAngleRad = ((coneAngleDeg / 2) * Math.PI) / 180;
      const maxAngle = halfAngleRad * 1.25;

      for (let y = 0; y < size; y++) {
        const dy = y - apexY;
        const rowOffset = y * size * 4;

        for (let x = 0; x < size; x++) {
          const dx = x - apexX;
          const dist = Math.hypot(dx, dy);

          if (dist === 0 || dist > radius) continue;

          const angle = Math.abs(Math.atan2(dy, dx));
          if (angle > maxAngle) continue;

          // Smooth distance falloff from apex to radius
          const normDist = dist / radius;
          const distFalloff = Math.max(0, Math.pow(1 - normDist * normDist, 1.5));

          // Single, unified smooth angular falloff from center axis (1.0) to edge (0.0)
          const normAngle = angle / halfAngleRad;
          if (normAngle > 1.0) continue;
          const angleFalloff = 0.5 + 0.5 * Math.cos(normAngle * Math.PI);

          const finalAlpha = Math.min(255, Math.round(255 * distFalloff * angleFalloff));

          if (finalAlpha > 0) {
            const idx = rowOffset + x * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = finalAlpha;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const texture = Texture.from(canvas);
      this.coneTextures.set(key, texture);
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

    this.coneTextures.forEach((tex) => {
      try {
        tex.destroy(true);
      } catch {
        // ignore
      }
    });
    this.coneTextures.clear();
  }
}
