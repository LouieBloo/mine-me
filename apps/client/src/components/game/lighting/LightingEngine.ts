import { Application, Container, Graphics, RenderTexture, Sprite, BlurFilter } from 'pixi.js';
import type { Vector2D, MiningClientTile } from '@mine-me/shared';
import { LightSource } from './LightSource';
import { calculateSunlightMap } from './SunlightCalculator';

/**
 * Lighting Engine coordinates a 2D Multiplicative Lightmap pipeline in PixiJS v8.
 *
 * It manages:
 * - Depth-graded ambient underground darkness
 * - Real-time sunlight propagation down excavated shafts
 * - Dynamic player flashlight, flickering torches, and mineral/chest glows
 * - Offscreen rendering to a RenderTexture lightmap overlay with 'multiply' blend mode
 */
export class LightingEngine {
  private app: Application;
  private parentContainer: Container;
  private gridWidth: number;
  private gridHeight: number;
  private tileSize: number;

  private lightmapRT: RenderTexture | null = null;
  private lightmapSprite: Sprite | null = null;
  private lightsContainer: Container;
  private ambientGraphics: Graphics;
  private sunlightGraphics: Graphics;
  private lightsGraphics: Graphics;

  private lights: Map<string, LightSource> = new Map();
  private sunlightMap: number[][] | null = null;
  private isDestroyed: boolean = false;

  // Margin above and around grid (in pixels)
  private readonly skyMargin: number = 800;
  private readonly sideMargin: number = 600;

  constructor(
    app: Application,
    parentContainer: Container,
    gridWidth: number,
    gridHeight: number,
    tileSize: number
  ) {
    this.app = app;
    this.parentContainer = parentContainer;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.tileSize = tileSize;

    // Internal offscreen container where all ambient, sun, and light sources are rendered
    this.lightsContainer = new Container();
    this.ambientGraphics = new Graphics();
    this.sunlightGraphics = new Graphics();
    this.lightsGraphics = new Graphics();

    this.lightsContainer.addChild(this.ambientGraphics);
    this.lightsContainer.addChild(this.sunlightGraphics);
    this.lightsContainer.addChild(this.lightsGraphics);

    // Apply Blur Filter to soften ambient depth bands, sunlight columns, and flashlight cones
    try {
      const blurFilter = new BlurFilter({ strength: 16, quality: 3 });
      this.lightsContainer.filters = [blurFilter];
    } catch (err) {
      console.warn('[LightingEngine] Failed to create BlurFilter (headless/test env?):', err);
    }

    this.initLightmap();
  }

  /**
   * Initialize the RenderTexture and multiplier overlay sprite.
   */
  private initLightmap(): void {
    const totalPixelWidth = this.gridWidth * this.tileSize + this.sideMargin * 2;
    const totalPixelHeight = this.gridHeight * this.tileSize + this.skyMargin + this.sideMargin;

    try {
      this.lightmapRT = RenderTexture.create({
        width: Math.max(256, Math.min(4096, totalPixelWidth)),
        height: Math.max(256, Math.min(4096, totalPixelHeight)),
      });

      this.lightmapSprite = new Sprite(this.lightmapRT);
      this.lightmapSprite.x = -this.sideMargin;
      this.lightmapSprite.y = -this.skyMargin;
      this.lightmapSprite.blendMode = 'multiply';

      this.parentContainer.addChild(this.lightmapSprite);
    } catch (err) {
      console.warn('[LightingEngine] Failed to create RenderTexture, falling back to direct overlay:', err);
    }
  }

  /**
   * Add a light source to the engine.
   */
  public addLight(light: LightSource): void {
    this.lights.set(light.id, light);
  }

  /**
   * Remove a light source by id.
   */
  public removeLight(id: string): void {
    const light = this.lights.get(id);
    if (light) {
      light.destroy();
      this.lights.delete(id);
    }
  }

  /**
   * Get a light source by id.
   */
  public getLight(id: string): LightSource | undefined {
    return this.lights.get(id);
  }

  /**
   * Recalculate sunlight map when grid tiles change (e.g. blocks excavated or revealed).
   */
  public updateGrid(grid: MiningClientTile[][]): void {
    if (!grid || grid.length === 0) return;
    this.sunlightMap = calculateSunlightMap(grid);
  }

  /**
   * Frame update called from the Pixi ticker.
   * Updates light animations and re-renders the lightmap.
   */
  public update(dt: number, _playerPos?: Vector2D, _playerFacing?: Vector2D): void {
    if (this.isDestroyed || !this.lightmapRT || !this.app.renderer) return;

    // 1. Update all dynamic lights (flicker, pulse, movement)
    this.lights.forEach((light) => {
      if (light.enabled) {
        light.update(dt);
      }
    });

    // 2. Render ambient depth darkness
    this.renderAmbient();

    // 3. Render sunlight propagation shafts
    this.renderSunlight();

    // 4. Render all active light sources
    this.renderLights();

    // 5. Position lights container relative to lightmap origin (-sideMargin, -skyMargin)
    this.lightsContainer.x = this.sideMargin;
    this.lightsContainer.y = this.skyMargin;

    // 6. Render lightsContainer into lightmap RenderTexture
    try {
      this.app.renderer.render({
        container: this.lightsContainer,
        target: this.lightmapRT,
        clear: true,
      });
    } catch {
      // In headless or test environments renderer.render may be mocked/unavailable
    }
  }

  /**
   * Render depth-graded ambient darkness.
   * Surface is 100% daylight (white 0xffffff); deep underground fades to atmospheric dark blue (0x060814).
   */
  private renderAmbient(): void {
    const g = this.ambientGraphics;
    g.clear();

    const worldWidth = this.gridWidth * this.tileSize;
    const worldHeight = this.gridHeight * this.tileSize;

    // 1. Sky & Surface above ground (y <= 0): 100% daylight white
    g.rect(-this.sideMargin, -this.skyMargin, worldWidth + this.sideMargin * 2, this.skyMargin);
    g.fill({ color: 0xffffff, alpha: 1.0 });

    // 2. Depth gradient steps for underground (y in [0, gridHeight])
    // Ambient multipliers by depth layer:
    const depthColors: { depth: number; color: number }[] = [
      { depth: 0, color: 0xffffff }, // Surface opening: 100% brightness
      { depth: 1, color: 0xb8c2d4 }, // Depth 1: Soft twilight
      { depth: 2, color: 0x7a869e }, // Depth 2: Dim entrance
      { depth: 3, color: 0x48536c }, // Depth 3: Deep twilight
      { depth: 4, color: 0x242c42 }, // Depth 4: Dark tunnel
      { depth: 5, color: 0x121728 }, // Depth 5: Very dark
      { depth: 6, color: 0x060814 }, // Depth 6+: Deep underground pitch darkness
    ];

    const maxGradientDepth = depthColors[depthColors.length - 1].depth;

    for (let y = 0; y < maxGradientDepth; y++) {
      const topColor = depthColors[y].color;
      const bottomColor = depthColors[Math.min(y + 1, depthColors.length - 1)].color;
      const yStart = y * this.tileSize;
      const yHeight = this.tileSize;

      // Draw sub-stripes for smooth gradient transitions
      const subSteps = 3;
      for (let s = 0; s < subSteps; s++) {
        const t = s / subSteps;
        const subColor = this.lerpColor(topColor, bottomColor, t);
        const subY = yStart + (yHeight / subSteps) * s;
        const subHeight = yHeight / subSteps + 1;

        g.rect(-this.sideMargin, subY, worldWidth + this.sideMargin * 2, subHeight);
        g.fill({ color: subColor, alpha: 1.0 });
      }
    }

    // 3. Deep underground below max gradient depth: Solid deep darkness (0x060814)
    const deepY = maxGradientDepth * this.tileSize;
    const deepHeight = worldHeight - deepY + this.sideMargin;
    if (deepHeight > 0) {
      g.rect(-this.sideMargin, deepY, worldWidth + this.sideMargin * 2, deepHeight);
      g.fill({ color: 0x060814, alpha: 1.0 });
    }
  }

  /**
   * Render sunlight columns and diffused patches.
   */
  private renderSunlight(): void {
    const g = this.sunlightGraphics;
    g.clear();

    if (!this.sunlightMap || this.sunlightMap.length === 0) return;

    for (let y = 0; y < this.sunlightMap.length; y++) {
      const row = this.sunlightMap[y];
      for (let x = 0; x < row.length; x++) {
        const sun = row[x];
        if (sun <= 0.01) continue;

        const tilePxX = x * this.tileSize;
        const tilePxY = y * this.tileSize;

        // Render soft sunlight tile patch
        // Sunlight color: Warm golden sunlight (0xfffbeb)
        const alpha = Math.min(1.0, sun * 0.95);
        g.rect(tilePxX - 2, tilePxY - 2, this.tileSize + 4, this.tileSize + 4);
        g.fill({ color: 0xfffbeb, alpha });
      }
    }
  }

  /**
   * Render all active point lights, flashlights, and glows.
   */
  private renderLights(): void {
    const g = this.lightsGraphics;
    g.clear();

    this.lights.forEach((light) => {
      if (light.enabled) {
        light.render(this.lightsContainer, g, this.tileSize);
      } else if ('sprite' in light && (light as any).sprite) {
        (light as any).sprite.visible = false;
      }
    });
  }

  /**
   * Interpolate between two RGB hex colors.
   */
  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;

    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Clean up lightmap, textures, and child objects.
   */
  public destroy(): void {
    this.isDestroyed = true;

    this.lights.forEach((light) => light.destroy());
    this.lights.clear();

    if (this.lightmapSprite) {
      this.parentContainer.removeChild(this.lightmapSprite);
      this.lightmapSprite.destroy({ texture: false });
      this.lightmapSprite = null;
    }

    if (this.lightmapRT) {
      try {
        this.lightmapRT.destroy(true);
      } catch {
        // ignore
      }
      this.lightmapRT = null;
    }

    this.lightsContainer.destroy({ children: true });
  }
}
