import {
  CLOUD_PERIOD_PX,
  cloudAlpha,
  cloudPuffs,
  cloudSpecs,
  cloudX,
  hash01,
  layerTileOffset,
  lerpColor,
  lightningBolt,
  overcastOf,
  parseCssColor,
  silhouetteHeights,
  silhouettePolygon,
  skyGradientColors,
  toHexColor,
  type SurfaceEnvironmentDefinition,
  type SurfaceLayerShape,
  type WeatherState,
} from '@mine-me/shared';

/** The parts of a 2D canvas context the preview draws with, so it can be tested with a recording stand-in. */
export type SurfacePreviewContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'translate' | 'fillRect' | 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'arc' | 'ellipse' | 'fill' | 'stroke'
  | 'drawImage' | 'createLinearGradient' | 'rect' | 'clip' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'globalCompositeOperation'
>;

/** The preview's size in pixels, and where the ground starts. One small block is `PREVIEW_BLOCK` pixels. */
export const PREVIEW_WIDTH = 720;
export const PREVIEW_HEIGHT = 300;
export const PREVIEW_HORIZON = 232;
export const PREVIEW_BLOCK = 4;
/** The width of one tile of a silhouette strip. */
export const PREVIEW_TILE_WIDTH = 720;
const SKY_BANDS = 24;
const OVERCAST_GREY = 0x8d98a6;
const GROUND_COLOR = '#5b4636';
const GRASS_COLOR = '#4d7c3a';
const DEFAULT_LAYER_COLORS: Record<SurfaceLayerShape, number> = { mountains: 0x8da2c2, hills: 0x6f9a6a, treeline: 0x3f6b45, flat: 0x5c8a55 };

/** What the preview shows at one moment. */
export interface SurfacePreviewState {
  /** How far the camera has been dragged along the scenery, in pixels. */
  cameraX: number;
  /** Seconds, for the drifting clouds and falling rain. */
  time: number;
  weather: WeatherState;
  /** The lightning flash, 0 to 1, and where its bolt strikes across the picture (0 to 1). */
  flash: number;
  strikeX: number;
}

export type PreviewImages = ReadonlyMap<string, CanvasImageSource | null>;

const css = (color: number): string => toHexColor(color);

/** The sky from the top to the horizon, greyed by the cloud cover, and the sun. */
export function drawSky(ctx: SurfacePreviewContext, env: SurfaceEnvironmentDefinition, overcast: number, state: SurfacePreviewState): void {
  const grey = overcast * 0.65;
  const top = lerpColor(parseCssColor(env.sky.top), OVERCAST_GREY, grey);
  const horizon = lerpColor(parseCssColor(env.sky.horizon), OVERCAST_GREY, grey);
  const band = PREVIEW_HORIZON / SKY_BANDS;
  skyGradientColors(top, horizon, SKY_BANDS).forEach((color, i) => {
    ctx.fillStyle = css(color);
    ctx.fillRect(0, i * band, PREVIEW_WIDTH, band + 1);
  });
  if (env.sky.sunColor && (env.sky.sunSize ?? 0) > 0) {
    const radius = (env.sky.sunSize ?? 3) * PREVIEW_BLOCK;
    const x = PREVIEW_WIDTH * (env.sky.sunX ?? 0.7) - state.cameraX * 0.03;
    const y = PREVIEW_HORIZON - (env.sky.sunHeight ?? 20) * PREVIEW_BLOCK;
    ctx.fillStyle = env.sky.sunColor;
    for (const [scale, alpha] of [[2.4, 0.12], [1.6, 0.2], [1, 1]] as const) {
      ctx.globalAlpha = alpha * (1 - overcast * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** The clouds the weather shows, drifting with the time. Returns how many were drawn. */
export function drawClouds(ctx: SurfacePreviewContext, env: SurfaceEnvironmentDefinition, weather: WeatherState, state: SurfacePreviewState, seed: number): number {
  const specs = cloudSpecs(seed, env.clouds?.maxCount ?? 8);
  const low = env.clouds?.minHeight ?? 8;
  const high = Math.max(low, env.clouds?.maxHeight ?? 22);
  const period = Math.max(CLOUD_PERIOD_PX, PREVIEW_WIDTH * 1.6);
  const tint = css(lerpColor(0xffffff, 0x4d5663, weather.cloudDarkness));
  let drawn = 0;
  for (const spec of specs) {
    const alpha = cloudAlpha(spec, weather.cloudDensity) * 0.92;
    if (alpha <= 0.01) continue;
    const width = 16 * PREVIEW_BLOCK * spec.scale;
    const height = width * 0.5;
    const start = -width;
    const along = cloudX(spec, state.time, period) + state.cameraX * spec.parallax;
    const x = start + (((along - start) % period) + period) % period;
    if (x > PREVIEW_WIDTH) continue;
    const y = PREVIEW_HORIZON - (low + spec.y * (high - low)) * PREVIEW_BLOCK - height / 2;
    ctx.fillStyle = tint;
    ctx.globalAlpha = alpha;
    for (const puff of cloudPuffs(spec.variant)) {
      ctx.beginPath();
      ctx.ellipse(x + puff.x * width, y + puff.y * height, puff.rx * width, puff.ry * height, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawn++;
  }
  ctx.globalAlpha = 1;
  return drawn;
}

/** One strip of scenery along the horizon, far to near: a picture tiled across, or a silhouette in code. */
export function drawLayer(ctx: SurfacePreviewContext, layer: SurfaceEnvironmentDefinition['layers'][number], image: CanvasImageSource | null, cameraX: number, seed: number, index: number): void {
  const offset = layerTileOffset(cameraX, layer.parallaxFactor);
  const bottom = PREVIEW_HORIZON + layer.yOffset * PREVIEW_BLOCK;
  ctx.globalAlpha = layer.alpha ?? 1;
  if (image && layer.textureUrl) {
    const scale = (layer.scale ?? 1) * ((layer.height ?? 0) > 0 ? 1 : 1);
    const nativeW = (image as { width?: number }).width ?? PREVIEW_TILE_WIDTH;
    const nativeH = (image as { height?: number }).height ?? 100;
    const w = nativeW * scale;
    const h = nativeH * scale;
    const first = Math.floor(-offset / w) - 1;
    for (let i = first; offset + i * w < PREVIEW_WIDTH; i++) ctx.drawImage(image, offset + i * w, bottom - h, w, h);
  } else {
    const shape = layer.shape ?? 'hills';
    const heights = silhouetteHeights(shape, seed + index * 17, 96);
    const height = Math.max(PREVIEW_BLOCK, (layer.height ?? 30) * PREVIEW_BLOCK);
    const points = silhouettePolygon(heights, PREVIEW_TILE_WIDTH, height);
    ctx.fillStyle = layer.tint ?? css(DEFAULT_LAYER_COLORS[shape]);
    const first = Math.floor(-offset / PREVIEW_TILE_WIDTH) - 1;
    for (let i = first; offset + i * PREVIEW_TILE_WIDTH < PREVIEW_WIDTH; i++) {
      ctx.save();
      ctx.translate(offset + i * PREVIEW_TILE_WIDTH, bottom - height);
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let p = 2; p < points.length; p += 2) ctx.lineTo(points[p], points[p + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** The ground the scenery stands behind. */
export function drawGround(ctx: SurfacePreviewContext): void {
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, PREVIEW_HORIZON, PREVIEW_WIDTH, PREVIEW_HEIGHT - PREVIEW_HORIZON);
  ctx.fillStyle = GRASS_COLOR;
  ctx.fillRect(0, PREVIEW_HORIZON, PREVIEW_WIDTH, 5);
}

/** Rain and snow falling to the ground, and fog along the horizon. Returns the streaks and flakes drawn. */
export function drawPrecipitation(ctx: SurfacePreviewContext, weather: WeatherState, state: SurfacePreviewState, seed: number): number {
  let drawn = 0;
  const slant = weather.wind * 0.7;
  const rain = Math.round(260 * weather.rainIntensity);
  ctx.strokeStyle = 'rgba(210,225,255,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < rain; i++) {
    const progress = (hash01(seed, i, 82) + (state.time * (0.9 + hash01(seed, i, 83) * 0.4) * 900) / PREVIEW_HORIZON) % 1;
    const y = progress * PREVIEW_HORIZON;
    const x = hash01(seed, i, 81) * PREVIEW_WIDTH + slant * y;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + slant * 8, y + 10);
    ctx.stroke();
    drawn++;
  }
  const snow = Math.round(180 * weather.snow);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < snow; i++) {
    const y = (hash01(seed, i, 92) * PREVIEW_HORIZON + state.time * 55 * (0.6 + hash01(seed, i, 93))) % PREVIEW_HORIZON;
    const x = hash01(seed, i, 91) * PREVIEW_WIDTH + Math.sin(state.time * 1.3 + i) * 10;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    drawn++;
  }
  if (weather.fog > 0.01) {
    for (let band = 0; band < 3; band++) {
      const gradient = ctx.createLinearGradient(0, PREVIEW_HORIZON - 60, 0, PREVIEW_HORIZON + 4);
      gradient.addColorStop(0, 'rgba(235,240,245,0)');
      gradient.addColorStop(1, `rgba(235,240,245,${Math.min(0.7, weather.fog * 0.6)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, PREVIEW_HORIZON - 60 + band * 6, PREVIEW_WIDTH, 64);
      drawn++;
    }
  }
  return drawn;
}

/** A flash over the sky and a bolt down to the ground. */
export function drawLightning(ctx: SurfacePreviewContext, state: SurfacePreviewState, seed: number): void {
  if (state.flash <= 0.01) return;
  ctx.fillStyle = `rgba(255,255,255,${(state.flash * 0.5).toFixed(3)})`;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HORIZON);
  if (state.flash < 0.2) return;
  const points = lightningBolt(seed, state.strikeX * PREVIEW_WIDTH, 0, PREVIEW_HORIZON - 2, 9, 14);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = Math.min(1, state.flash);
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** The whole picture: sky, sun, clouds, scenery far to near, ground, then the weather over it. */
export function drawSurfacePreview(ctx: SurfacePreviewContext, env: SurfaceEnvironmentDefinition, state: SurfacePreviewState, images: PreviewImages, seed: number): { clouds: number; particles: number } {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawSky(ctx, env, overcastOf(state.weather), state);
  const clouds = drawClouds(ctx, env, state.weather, state, seed);
  env.layers.forEach((layer, i) => drawLayer(ctx, layer, layer.textureUrl ? images.get(layer.textureUrl) ?? null : null, state.cameraX, seed, i));
  drawGround(ctx);
  const particles = drawPrecipitation(ctx, state.weather, state, seed);
  // The weather dims the light (the same colour the game multiplies the sky by)
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = css(state.weather.light);
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  ctx.globalCompositeOperation = 'source-over';
  drawLightning(ctx, state, seed);
  return { clouds, particles };
}
