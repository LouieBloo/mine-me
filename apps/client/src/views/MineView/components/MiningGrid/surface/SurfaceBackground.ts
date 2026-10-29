import { Container, Graphics, Texture, TilingSprite, Assets } from 'pixi.js';
import {
  getAssetUrl,
  layerTileOffset,
  lerpColor,
  parseCssColor,
  skyGradientColors,
  skyInView,
  type SurfaceEnvironmentDefinition,
  type SurfaceLayerDef,
  type SurfaceLayerShape,
} from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { silhouetteTexture } from './surfaceTextures';

/** The part of the world on screen, in world pixels. */
export interface SurfaceView {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type SurfaceTextureLoader = (url: string) => Promise<Texture | null>;
const defaultLoad: SurfaceTextureLoader = (url) => Assets.load<Texture>(getAssetUrl(url)).catch(() => null);

/** How many bands the sky gradient is drawn in, and how far above the horizon it takes to reach the top colour (small blocks). */
const SKY_BANDS = 24;
const SKY_GRADIENT_BLOCKS = 70;
/** How far above the horizon the sky is drawn at all (small blocks), so a camera high up still sees sky. */
const SKY_TOTAL_BLOCKS = 400;
/** The colour clouds and storms pull the sky towards. */
const OVERCAST_GREY = 0x8d98a6;
/** How much of that grey a fully overcast sky has. */
const OVERCAST_MAX = 0.65;
/** The sun drifts against the camera at this share of its movement (it is very far away). */
const SUN_DRIFT = 0.03;
/** Pixels the scenery strips are drawn beyond each side of the view, so the edge never shows while the camera moves. */
const VIEW_PAD = 64;
/** The width of a procedural scenery tile, in pixels (it repeats). */
const PROCEDURAL_TILE_WIDTH = 1536;

const DEFAULT_LAYER_COLORS: Record<SurfaceLayerShape, number> = { mountains: 0x8da2c2, hills: 0x6f9a6a, treeline: 0x3f6b45, flat: 0x5c8a55 };

/** One scenery strip as built. */
interface LayerView {
  def: SurfaceLayerDef;
  sprite: TilingSprite;
  /** Height in pixels of one picture (before the layer's scale). */
  textureHeight: number;
  scale: number;
}

/**
 * The sky and the scenery behind the ground (ticket 130): a gradient from the top of the view to the horizon, a sun, and the
 * environment's strips of mountains, hills and trees scrolling at their own speeds. It lives in the world (so it zooms with the
 * terrain), is only drawn above the ground, and is hidden outright when no sky is on screen, so underground it costs nothing.
 * A strip without a picture is drawn as a silhouette in code.
 */
export class SurfaceBackground {
  public readonly root = new Container();
  private readonly sky = new Graphics();
  private readonly sun = new Graphics();
  /** Clouds go here (between the sun and the scenery), see CloudField. */
  public readonly cloudLayer = new Container();
  private readonly layerLayer = new Container();
  private readonly layers: LayerView[] = [];
  private readonly textureCache = new Map<string, Texture>();
  private environment: SurfaceEnvironmentDefinition;
  private overcast = 0;
  private drawnOvercast = -1;
  private generation = 0;
  private destroyed = false;
  private readonly loadTexture: SurfaceTextureLoader;
  private readonly surfaceY: number;
  private readonly mapWidth: number;
  private readonly seed: number;
  private readonly tileSize: number;

  constructor(
    parent: Container,
    environment: SurfaceEnvironmentDefinition,
    options: { surfaceY: number; mapWidth: number; seed: number; tileSize?: number; loadTexture?: SurfaceTextureLoader }
  ) {
    this.surfaceY = options.surfaceY;
    this.mapWidth = options.mapWidth;
    this.seed = options.seed;
    this.tileSize = options.tileSize ?? TILE_SIZE;
    this.loadTexture = options.loadTexture ?? defaultLoad;
    this.environment = environment;
    this.root.label = 'surface-background';
    this.root.addChild(this.sky, this.sun, this.cloudLayer, this.layerLayer);
    parent.addChild(this.root);
    this.build();
  }

  /** Whether sky is on screen right now (the last `update`). Underground it is false and nothing is drawn. */
  public get active(): boolean {
    return this.root.visible;
  }

  /** How many display objects the surface scenery holds (for the performance overlay). */
  public get objectCount(): number {
    return 2 + this.layers.length;
  }

  public setEnvironment(environment: SurfaceEnvironmentDefinition): void {
    this.environment = environment;
    this.build();
  }

  /** How overcast the sky is, 0 (blue) to 1 (grey). Redrawn only when it moved enough to see. */
  public setOvercast(value: number): void {
    this.overcast = Math.min(1, Math.max(0, value));
    const quantized = Math.round(this.overcast * 20) / 20;
    if (quantized !== this.drawnOvercast) this.drawSky(quantized);
  }

  /** Positions everything for the view. Hides the whole thing (and does nothing else) when no sky can be seen. */
  public update(view: SurfaceView): void {
    const inView = skyInView(view.top, this.surfaceY);
    this.root.visible = inView;
    if (!inView) return;
    this.positionSun(view);
    for (const layer of this.layers) this.positionLayer(layer, view);
  }

  public destroy(): void {
    this.destroyed = true;
    this.root.destroy({ children: true });
  }

  private build(): void {
    this.generation++;
    for (const layer of this.layers) layer.sprite.destroy();
    this.layers.length = 0;
    this.layerLayer.removeChildren();
    this.drawnOvercast = -1;
    this.drawSky(Math.round(this.overcast * 20) / 20);
    this.drawSun();
    this.environment.layers.forEach((def, i) => this.addLayer(def, i));
  }

  private drawSky(overcast: number): void {
    this.drawnOvercast = overcast;
    const sky = this.environment.sky;
    const grey = overcast * OVERCAST_MAX;
    const top = lerpColor(parseCssColor(sky.top), OVERCAST_GREY, grey);
    const horizon = lerpColor(parseCssColor(sky.horizon), OVERCAST_GREY, grey);
    const bandPx = (SKY_GRADIENT_BLOCKS * this.tileSize) / SKY_BANDS;
    const left = -this.mapWidth;
    const width = this.mapWidth * 3;
    const g = this.sky;
    g.clear();
    // Everything above the gradient is the top colour
    const gradientTop = this.surfaceY - SKY_GRADIENT_BLOCKS * this.tileSize;
    g.rect(left, this.surfaceY - SKY_TOTAL_BLOCKS * this.tileSize, width, gradientTop - (this.surfaceY - SKY_TOTAL_BLOCKS * this.tileSize) + 1).fill(top);
    skyGradientColors(top, horizon, SKY_BANDS).forEach((color, i) => {
      g.rect(left, gradientTop + i * bandPx, width, bandPx + 1).fill(color);
    });
  }

  private drawSun(): void {
    const sky = this.environment.sky;
    this.sun.clear();
    this.sun.visible = Boolean(sky.sunColor) && (sky.sunSize ?? 0) > 0;
    if (!this.sun.visible) return;
    const color = parseCssColor(sky.sunColor);
    const radius = (sky.sunSize ?? 3) * this.tileSize;
    this.sun.circle(0, 0, radius * 2.4).fill({ color, alpha: 0.12 });
    this.sun.circle(0, 0, radius * 1.6).fill({ color, alpha: 0.2 });
    this.sun.circle(0, 0, radius).fill({ color, alpha: 1 });
  }

  private positionSun(view: SurfaceView): void {
    if (!this.sun.visible) return;
    const sky = this.environment.sky;
    const centre = this.mapWidth / 2 - (view.left + view.width / 2);
    this.sun.position.set(view.left + view.width * (sky.sunX ?? 0.7) + centre * SUN_DRIFT, this.surfaceY - (sky.sunHeight ?? 20) * this.tileSize);
  }

  private addLayer(def: SurfaceLayerDef, index: number): void {
    const scale = def.scale && def.scale > 0 ? def.scale : 1;
    const shape: SurfaceLayerShape = def.shape ?? 'hills';
    const heightPx = Math.max(this.tileSize, (def.height ?? 30) * this.tileSize);
    const procedural = silhouetteTexture(shape, this.seed + index * 17, 0xffffff, PROCEDURAL_TILE_WIDTH, heightPx);
    const sprite = new TilingSprite({ texture: procedural, width: 1, height: heightPx });
    sprite.label = `surface-layer-${def.name}`;
    sprite.alpha = def.alpha ?? 1;
    sprite.tint = def.tint ? parseCssColor(def.tint) : DEFAULT_LAYER_COLORS[shape];
    const layer: LayerView = { def, sprite, textureHeight: heightPx, scale: 1 };
    this.layers.push(layer);
    this.layerLayer.addChild(sprite);
    if (def.textureUrl) {
      const generation = this.generation;
      void this.loadTexture(def.textureUrl).then((texture) => {
        if (this.destroyed || generation !== this.generation || !texture || sprite.destroyed) return;
        this.textureCache.set(def.textureUrl as string, texture);
        sprite.texture = texture;
        // A picture is tinted only when the layer asks for it
        sprite.tint = def.tint ? parseCssColor(def.tint) : 0xffffff;
        layer.textureHeight = texture.height;
        layer.scale = scale;
      });
    }
  }

  private positionLayer(layer: LayerView, view: SurfaceView): void {
    const { sprite, def } = layer;
    const heightPx = layer.textureHeight * layer.scale;
    sprite.x = view.left - VIEW_PAD;
    sprite.width = view.width + VIEW_PAD * 2;
    sprite.height = heightPx;
    sprite.tileScale.set(layer.scale);
    sprite.tilePosition.x = layerTileOffset(view.left - VIEW_PAD, def.parallaxFactor);
    sprite.y = this.surfaceY + def.yOffset * this.tileSize - heightPx;
  }
}
