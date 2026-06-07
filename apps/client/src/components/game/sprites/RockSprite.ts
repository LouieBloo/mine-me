import { Assets, Graphics, Sprite, Texture } from 'pixi.js';
import { BaseSprite } from './BaseSprite';

export class RockSprite extends BaseSprite {
  async load(): Promise<void> {
    if (this.destroyed) return;
    try {
      const srcUrl = `${import.meta.env.VITE_API_URL || ''}/assets/sprites/oreVein.png`;
      const texture: Texture = await Assets.load({ src: srcUrl, alias: 'ore_vein_sprite' });
      if (this.destroyed) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const maxDim = Math.max(texture.width, texture.height);
      if (maxDim > 0) {
        sprite.scale.set(1);
      }
      this.wrapper.addChild(sprite);
    } catch (err) {
      console.warn('[RockSprite] Failed to load ore vein sprite, falling back to graphics', err);
      const graphics = new Graphics();
      graphics.rect(-50, -50, 100, 100);
      graphics.fill(0x475569); // slate-600
      graphics.stroke({ width: 4, color: 0x94a3b8 }); // slate-400 border
      this.wrapper.addChild(graphics);
    }
  }
}
