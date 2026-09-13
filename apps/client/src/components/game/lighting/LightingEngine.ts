import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
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
 * - Offscreen rendering to a downscaled RenderTexture lightmap overlay with 'multiply' blend mode
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
  private sunlightDirty: boolean = false;
  private cachedGrid: MiningClientTile[][] | null = null;
  private isDestroyed: boolean = false;

  // Dirty tracking for offscreen lightmap re-rendering
  private isLightmapDirty: boolean = true;
  private lastFlashlightPos: Vector2D = { x: -999, y: -999 };
  private lastFlashlightDir: Vector2D = { x: -999, y: -999 };
  private lastFlashlightEnabled: boolean = false;
  private lightThrottleTimer: number = 0;

  // Margin above and around grid (in pixels)
  private readonly skyMargin: number = 800;
  private readonly sideMargin: number = 600;

  // Downscale factor for the offscreen lightmap render texture (0.25 = 1/4 resolution, ~1024x1024)
  // Low-resolution lightmap smoothly scales up via GPU bilinear filtering, providing natural soft diffusion with zero blur filter overhead.
  private readonly lightmapScale: number = 0.25;

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

    this.lightsContainer.scale.set(this.lightmapScale);

    this.initLightmap();
    this.renderAmbient();
  }

  /**
   * Initialize the RenderTexture and multiplier overlay sprite.
   */
  private initLightmap(): void {
    const totalPixelWidth = this.gridWidth * this.tileSize + this.sideMargin * 2;
    const totalPixelHeight = this.gridHeight * this.tileSize + this.skyMargin + this.sideMargin;

    const rtWidth = Math.max(64, Math.round(totalPixelWidth * this.lightmapScale));
    const rtHeight = Math.max(64, Math.round(totalPixelHeight * this.lightmapScale));

    try {
      this.lightmapRT = RenderTexture.create({
        width: Math.min(2048, rtWidth),
        height: Math.min(2048, rtHeight),
      });

      this.lightmapSprite = new Sprite(this.lightmapRT);
      this.lightmapSprite.x = -this.sideMargin;
      this.lightmapSprite.y = -this.skyMargin;
      this.lightmapSprite.width = totalPixelWidth;
      this.lightmapSprite.height = totalPixelHeight;
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
    this.isLightmapDirty = true;
  }

  /**
   * Remove a light source by id.
   */
  public removeLight(id: string): void {
    const light = this.lights.get(id);
    if (light) {
      light.destroy();
      this.lights.delete(id);
      this.isLightmapDirty = true;
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
   * @param immediate If true, recalculates and re-renders sunlight synchronously (e.g. on level start).
   */
  public updateGrid(grid: MiningClientTile[][], immediate: boolean = false): void {
    if (!grid || grid.length === 0) return;
    this.cachedGrid = grid;
    if (immediate) {
      this.sunlightDirty = false;
      this.sunlightMap = calculateSunlightMap(grid);
      this.renderSunlight();
      this.isLightmapDirty = true;
    } else {
      this.sunlightDirty = true;
    }
  }

  /**
   * Mark sunlight dirty to be recalculated on the next frame ticker update.
   */
  public markSunlightDirty(grid?: MiningClientTile[][]): void {
    if (grid) {
      this.cachedGrid = grid;
    }
    this.sunlightDirty = true;
  }

  /**
   * Manually mark the lightmap dirty so it re-renders on the next frame update.
   */
  public markLightmapDirty(): void {
    this.isLightmapDirty = true;
  }

  /**
   * Frame update called from the Pixi ticker.
   * Updates light animations and re-renders the lightmap ONLY when dirty.
   */
  public update(dt: number, playerPos?: Vector2D, playerFacing?: Vector2D): void {
    if (this.isDestroyed || !this.lightmapRT || !this.app.renderer) return;

    // 0. Recalculate sunlight if marked dirty by tile reveals or block digging
    if (this.sunlightDirty && this.cachedGrid) {
      this.sunlightDirty = false;
      this.sunlightMap = calculateSunlightMap(this.cachedGrid);
      this.renderSunlight();
      this.isLightmapDirty = true;
    }

    // 1. Check flashlight state and movement
    const flashlight = this.lights.get('player_flashlight');
    const flashlightEnabled = flashlight?.enabled ?? false;
    if (flashlightEnabled !== this.lastFlashlightEnabled) {
      this.lastFlashlightEnabled = flashlightEnabled;
      this.isLightmapDirty = true;
    }
    if (flashlightEnabled && playerPos && playerFacing) {
      const dx = playerPos.x - this.lastFlashlightPos.x;
      const dy = playerPos.y - this.lastFlashlightPos.y;
      const dDirX = playerFacing.x - this.lastFlashlightDir.x;
      const dDirY = playerFacing.y - this.lastFlashlightDir.y;
      if (Math.hypot(dx, dy) > 0.02 || Math.hypot(dDirX, dDirY) > 0.02) {
        this.lastFlashlightPos = { x: playerPos.x, y: playerPos.y };
        this.lastFlashlightDir = { x: playerFacing.x, y: playerFacing.y };
        this.isLightmapDirty = true;
      }
    }

    // 2. Throttle dynamic torch / gem flickers to ~20Hz (every 50ms) to prevent 60 FPS FBO thrashing
    this.lightThrottleTimer += dt;
    if (this.lightThrottleTimer >= 0.05) {
      this.lightThrottleTimer = 0;
      let anyAnimatedLight = false;
      this.lights.forEach((light) => {
        if (light.enabled && light.id !== 'player_flashlight') {
          light.update(dt);
          anyAnimatedLight = true;
        }
      });
      if (anyAnimatedLight) {
        this.isLightmapDirty = true;
      }
    }

    // 3. Skip offscreen render pass entirely if lightmap hasn't changed
    if (!this.isLightmapDirty) return;
    this.isLightmapDirty = false;

    // 4. Render active dynamic light sources (torches, headlamp)
    this.renderLights();

    // 5. Position and scale lights container relative to downscaled lightmap origin (-sideMargin, -skyMargin)
    this.lightsContainer.scale.set(this.lightmapScale);
    this.lightsContainer.x = this.sideMargin * this.lightmapScale;
    this.lightsContainer.y = this.skyMargin * this.lightmapScale;

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
   * Uses continuous vertical slice blending and neighbor-aware wall insets
   * to eliminate blocky steps and prevent light bleeding onto solid cave walls.
   */
  private renderSunlight(): void {
    const g = this.sunlightGraphics;
    g.clear();

    if (!this.sunlightMap || this.sunlightMap.length === 0) return;

    const maxRenderY = Math.min(this.sunlightMap.length, 12);
    for (let y = 0; y < maxRenderY; y++) {
      const row = this.sunlightMap[y];
      for (let x = 0; x < row.length; x++) {
        const sun = row[x];
        if (sun <= 0.01) continue;

        const tilePxX = x * this.tileSize;
        const tilePxY = y * this.tileSize;

        // Check solid neighbors to prevent light bleeding into solid blocks on the sides
        const isLeftSolid = x === 0 || (this.sunlightMap[y]?.[x - 1] ?? 0) <= 0.001;
        const isRightSolid = x === row.length - 1 || (this.sunlightMap[y]?.[x + 1] ?? 0) <= 0.001;
        const isBottomSolid = y === maxRenderY - 1 || (this.sunlightMap[y + 1]?.[x] ?? 0) <= 0.001;

        // Inset by 2px on solid boundaries so bilinear filtering stays inside the air opening
        const leftInset = isLeftSolid ? 2 : 0;
        const rightInset = isRightSolid ? 2 : 0;
        const bottomInset = isBottomSolid ? 2 : 0;

        const rectX = tilePxX + leftInset;
        const rectW = this.tileSize - leftInset - rightInset;

        // Soft vertical gradient interpolation between this tile and the tile below
        const sunTop = sun;
        const sunNext = y < maxRenderY - 1 ? (this.sunlightMap[y + 1]?.[x] ?? 0) : 0;
        const sunBottom = sunNext > 0.01 ? sunNext : sun * 0.4;

        const subSteps = 3;
        const sliceH = (this.tileSize - bottomInset) / subSteps;
        for (let s = 0; s < subSteps; s++) {
          const t = (s + 0.5) / subSteps;
          // Smooth cosine curve interpolation down the tile height
          const blendT = 0.5 - 0.5 * Math.cos(t * Math.PI);
          const currentSun = sunTop + (sunBottom - sunTop) * blendT;
          const alpha = Math.min(1.0, currentSun * 0.95);
          if (alpha <= 0.01) continue;

          g.rect(rectX, tilePxY + s * sliceH, rectW, sliceH + 0.5);
          g.fill({ color: 0xfffbeb, alpha });
        }
      }
    }
  }

  /**
   * Render all active point lights, flashlights, and glows.
   * Also ensures disabled lights have their sprites hidden.
   */
  private renderLights(): void {
    const g = this.lightsGraphics;
    g.clear();

    this.lights.forEach((light) => {
      light.render(this.lightsContainer, g, this.tileSize);
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
