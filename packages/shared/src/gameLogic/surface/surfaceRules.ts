import type { SurfaceEnvironmentDefinition, SurfaceLayerDef } from '../../types/surface';
import { hash01 } from '../weather/weather';
import { isWeatherId } from '../weather/weatherTypes';
import { isHexColor } from './surfaceColor';

const ENV_KEY = /^[a-z][a-z0-9_]*$/;
const LAYER_SHAPES = ['mountains', 'hills', 'treeline', 'flat'];

export const MAX_SURFACE_LAYERS = 6;
export const MAX_SURFACE_PROPS = 20;
export const MAX_SURFACE_CLOUD_TEXTURES = 6;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isAssetUrl = (v: unknown): boolean => typeof v === 'string' && v.startsWith('/assets/');

/** The environment used when the database has none, so a run always has a sky: a plain blue day with a sun and no scenery. */
export const DEFAULT_SURFACE_ENVIRONMENT: Readonly<SurfaceEnvironmentDefinition> = {
  id: 'default_surface',
  key: 'plain_day',
  name: 'Plain Day',
  description: 'A clear blue sky and a sun.',
  weight: 1,
  isDefault: true,
  sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: '#fff2b0', sunX: 0.7, sunHeight: 22, sunSize: 3 },
  ambientTint: null,
  layers: [],
  clouds: { maxCount: 8, minHeight: 8, maxHeight: 22 },
  weather: { clear: 1 },
  props: [],
  soundEffects: null,
};

/** Problems with one scenery layer, one message each. */
export function validateSurfaceLayer(layer: Partial<SurfaceLayerDef> | null | undefined): string[] {
  if (!layer || typeof layer !== 'object') return ['a layer is missing'];
  const errors: string[] = [];
  if (typeof layer.name !== 'string' || layer.name.trim() === '') errors.push('a layer needs a name');
  if (!isNumber(layer.parallaxFactor) || layer.parallaxFactor < 0 || layer.parallaxFactor > 1) errors.push('parallax must be from 0 to 1');
  if (!isNumber(layer.yOffset)) errors.push('vertical offset must be a number');
  if (layer.textureUrl != null && !isAssetUrl(layer.textureUrl)) errors.push('picture must be an /assets/... url');
  if (layer.tint != null && !isHexColor(layer.tint)) errors.push('tint must be a hex colour like #aabbcc');
  if (layer.scale != null && (!isNumber(layer.scale) || layer.scale <= 0 || layer.scale > 8)) errors.push('scale must be greater than 0 and at most 8');
  if (layer.shape != null && !LAYER_SHAPES.includes(layer.shape)) errors.push(`shape must be one of ${LAYER_SHAPES.join(', ')}`);
  if (layer.height != null && (!isNumber(layer.height) || layer.height <= 0 || layer.height > 200)) errors.push('height must be greater than 0 and at most 200');
  if (layer.alpha != null && (!isNumber(layer.alpha) || layer.alpha < 0 || layer.alpha > 1)) errors.push('alpha must be from 0 to 1');
  return errors;
}

/** Problems with an environment, one message each (empty when it is valid). */
export function validateSurfaceEnvironment(env: Partial<SurfaceEnvironmentDefinition>): string[] {
  const errors: string[] = [];
  if (typeof env.key !== 'string' || !ENV_KEY.test(env.key)) errors.push('key must be lower case letters, digits and underscores, starting with a letter');
  if (typeof env.name !== 'string' || env.name.trim() === '') errors.push('name is required');
  if (!isNumber(env.weight) || env.weight <= 0) errors.push('weight must be greater than 0');
  const sky = env.sky;
  if (!sky || typeof sky !== 'object') errors.push('the sky is missing');
  else {
    if (!isHexColor(sky.top)) errors.push('sky top must be a hex colour like #2f8fd8');
    if (!isHexColor(sky.horizon)) errors.push('sky horizon must be a hex colour like #9fd6ff');
    if (sky.sunColor != null && !isHexColor(sky.sunColor)) errors.push('sun colour must be a hex colour');
    if (sky.sunX != null && (!isNumber(sky.sunX) || sky.sunX < 0 || sky.sunX > 1)) errors.push('sun position must be from 0 to 1');
    if (sky.sunHeight != null && (!isNumber(sky.sunHeight) || sky.sunHeight < 0 || sky.sunHeight > 200)) errors.push('sun height must be from 0 to 200');
    if (sky.sunSize != null && (!isNumber(sky.sunSize) || sky.sunSize < 0 || sky.sunSize > 50)) errors.push('sun size must be from 0 to 50');
  }
  if (env.ambientTint != null && !isHexColor(env.ambientTint)) errors.push('ambient tint must be a hex colour');
  const layers = env.layers ?? [];
  if (!Array.isArray(layers)) errors.push('layers must be a list');
  else {
    if (layers.length > MAX_SURFACE_LAYERS) errors.push(`at most ${MAX_SURFACE_LAYERS} layers`);
    layers.forEach((l, i) => validateSurfaceLayer(l).forEach((e) => errors.push(`layer ${i + 1}: ${e}`)));
  }
  const clouds = env.clouds;
  if (clouds != null) {
    if (clouds.maxCount != null && (!Number.isInteger(clouds.maxCount) || clouds.maxCount < 0 || clouds.maxCount > 24)) errors.push('clouds: the most clouds must be a whole number from 0 to 24');
    if (clouds.textureUrls != null && (!Array.isArray(clouds.textureUrls) || clouds.textureUrls.length > MAX_SURFACE_CLOUD_TEXTURES || clouds.textureUrls.some((u) => !isAssetUrl(u)))) errors.push(`clouds: at most ${MAX_SURFACE_CLOUD_TEXTURES} pictures, each an /assets/... url`);
    if (clouds.minHeight != null && !isNumber(clouds.minHeight)) errors.push('clouds: the lowest height must be a number');
    if (clouds.maxHeight != null && !isNumber(clouds.maxHeight)) errors.push('clouds: the highest height must be a number');
    if (isNumber(clouds.minHeight) && isNumber(clouds.maxHeight) && clouds.maxHeight < clouds.minHeight) errors.push('clouds: the highest height cannot be below the lowest');
  }
  const weather = env.weather;
  if (weather != null) {
    if (typeof weather !== 'object' || Array.isArray(weather)) errors.push('weather must be an object of weather to weight');
    else
      for (const [id, weight] of Object.entries(weather)) {
        if (!isWeatherId(id)) errors.push(`weather names an unknown kind: ${id}`);
        else if (!isNumber(weight) || weight < 0) errors.push(`weather ${id} weight must be 0 or more`);
      }
  }
  const props = env.props ?? [];
  if (!Array.isArray(props)) errors.push('props must be a list');
  else {
    if (props.length > MAX_SURFACE_PROPS) errors.push(`at most ${MAX_SURFACE_PROPS} props`);
    props.forEach((p, i) => {
      if (!p || typeof p.doodadKey !== 'string' || p.doodadKey === '') errors.push(`prop ${i + 1}: pick a doodad`);
      if (!p || !isNumber(p.density) || p.density < 0 || p.density > 200) errors.push(`prop ${i + 1}: density must be from 0 to 200`);
      if (p?.spacing != null && (!isNumber(p.spacing) || p.spacing < 0)) errors.push(`prop ${i + 1}: spacing must be 0 or more`);
      if (p?.minHeight != null && !isNumber(p.minHeight)) errors.push(`prop ${i + 1}: lowest height must be a number`);
      if (p?.maxHeight != null && !isNumber(p.maxHeight)) errors.push(`prop ${i + 1}: highest height must be a number`);
    });
  }
  return errors;
}

/**
 * The environment a run gets: one picked by weight from the run's seed (the same seed always picks the same one), the
 * default when there is none, and the built-in plain day when the list is empty. `preferredKey` (the sandbox) wins when it exists.
 */
export function pickSurfaceEnvironment(seed: number, environments: readonly SurfaceEnvironmentDefinition[] | undefined, preferredKey?: string | null): SurfaceEnvironmentDefinition {
  const list = [...(environments ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (preferredKey) {
    const wanted = list.find((e) => e.key === preferredKey);
    if (wanted) return wanted;
  }
  const candidates = list.filter((e) => isNumber(e.weight) && e.weight > 0);
  if (candidates.length === 0) return list.find((e) => e.isDefault) ?? list[0] ?? { ...DEFAULT_SURFACE_ENVIRONMENT };
  const total = candidates.reduce((sum, e) => sum + e.weight, 0);
  let at = hash01(seed, 0, 31) * total;
  for (const env of candidates) {
    at -= env.weight;
    if (at < 0) return env;
  }
  return candidates[candidates.length - 1];
}
