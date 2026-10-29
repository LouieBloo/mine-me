import { WEATHER_IDS, type SurfaceEnvironmentDefinition, type SurfaceLayerDef, type SurfacePropDef, type WeatherId } from '@mine-me/shared';

/** The edit state of a surface environment. Numbers may be NaN while their field is empty. */
export interface SurfaceEnvironmentForm {
  key: string;
  name: string;
  description: string;
  weight: number;
  isDefault: boolean;
  skyTop: string;
  skyHorizon: string;
  sunEnabled: boolean;
  sunColor: string;
  sunX: number;
  sunHeight: number;
  sunSize: number;
  /** '' = no tint. */
  ambientTint: string;
  layers: SurfaceLayerDef[];
  cloudMax: number;
  cloudMinHeight: number;
  cloudMaxHeight: number;
  cloudTextures: string[];
  weather: Record<WeatherId, number>;
  props: SurfacePropDef[];
}

const noWeather = (): Record<WeatherId, number> => Object.fromEntries(WEATHER_IDS.map((id) => [id, 0])) as Record<WeatherId, number>;

/** A new environment: a blue day with a sun, mostly clear with some clouds and the odd rain, no scenery yet. */
export const newEnvironment = (): SurfaceEnvironmentForm => ({
  key: '',
  name: '',
  description: '',
  weight: 1,
  isDefault: false,
  skyTop: '#2f8fd8',
  skyHorizon: '#9fd6ff',
  sunEnabled: true,
  sunColor: '#fff2b0',
  sunX: 0.7,
  sunHeight: 22,
  sunSize: 3,
  ambientTint: '',
  layers: [],
  cloudMax: 8,
  cloudMinHeight: 8,
  cloudMaxHeight: 22,
  cloudTextures: [],
  weather: { ...noWeather(), clear: 6, cloudy: 3, rain: 1 },
  props: [],
});

export const environmentToForm = (e: SurfaceEnvironmentDefinition): SurfaceEnvironmentForm => ({
  key: e.key,
  name: e.name,
  description: e.description ?? '',
  weight: e.weight,
  isDefault: Boolean(e.isDefault),
  skyTop: e.sky.top,
  skyHorizon: e.sky.horizon,
  sunEnabled: Boolean(e.sky.sunColor),
  sunColor: e.sky.sunColor ?? '#fff2b0',
  sunX: e.sky.sunX ?? 0.7,
  sunHeight: e.sky.sunHeight ?? 22,
  sunSize: e.sky.sunSize ?? 3,
  ambientTint: e.ambientTint ?? '',
  layers: (e.layers ?? []).map((l) => ({ ...l })),
  cloudMax: e.clouds?.maxCount ?? 8,
  cloudMinHeight: e.clouds?.minHeight ?? 8,
  cloudMaxHeight: e.clouds?.maxHeight ?? 22,
  cloudTextures: [...(e.clouds?.textureUrls ?? [])],
  weather: { ...noWeather(), ...(e.weather ?? {}) } as Record<WeatherId, number>,
  props: (e.props ?? []).map((p) => ({ ...p })),
});

/** The body to send: text trimmed, empty pictures dropped, weather left out at zero, nothing the server would refuse for shape. */
export const formToEnvironment = (f: SurfaceEnvironmentForm): Partial<SurfaceEnvironmentDefinition> => {
  const weather: Partial<Record<WeatherId, number>> = {};
  for (const id of WEATHER_IDS) if (Number.isFinite(f.weather[id]) && f.weather[id] > 0) weather[id] = f.weather[id];
  return {
    key: f.key.trim(),
    name: f.name.trim(),
    description: f.description.trim() === '' ? null : f.description.trim(),
    weight: f.weight,
    isDefault: f.isDefault,
    sky: {
      top: f.skyTop,
      horizon: f.skyHorizon,
      sunColor: f.sunEnabled ? f.sunColor : null,
      sunX: f.sunX,
      sunHeight: f.sunHeight,
      sunSize: f.sunSize,
    },
    ambientTint: f.ambientTint === '' ? null : f.ambientTint,
    layers: f.layers.map((l) => {
      const out: SurfaceLayerDef = { name: l.name.trim() || 'layer', parallaxFactor: l.parallaxFactor, yOffset: l.yOffset };
      if (l.textureUrl) out.textureUrl = l.textureUrl;
      if (l.tint) out.tint = l.tint;
      if (l.scale !== undefined && l.scale !== 1) out.scale = l.scale;
      if (!l.textureUrl) {
        out.shape = l.shape ?? 'hills';
        out.height = l.height ?? 30;
      }
      if (l.alpha !== undefined && l.alpha !== 1) out.alpha = l.alpha;
      return out;
    }),
    clouds: {
      maxCount: f.cloudMax,
      minHeight: f.cloudMinHeight,
      maxHeight: f.cloudMaxHeight,
      ...(f.cloudTextures.length > 0 ? { textureUrls: f.cloudTextures } : {}),
    },
    weather,
    props: f.props.filter((p) => p.doodadKey !== '').map((p) => {
      const out: SurfacePropDef = { doodadKey: p.doodadKey, density: p.density };
      if (p.spacing) out.spacing = p.spacing;
      if (p.minHeight !== undefined) out.minHeight = p.minHeight;
      if (p.maxHeight !== undefined) out.maxHeight = p.maxHeight;
      return out;
    }),
  };
};

/** A scenery layer with the defaults for the next one out: nearer than the last, so it scrolls faster and stands in front. */
export function newLayer(existing: readonly SurfaceLayerDef[]): SurfaceLayerDef {
  const last = existing[existing.length - 1];
  const shape = existing.length === 0 ? 'mountains' : existing.length === 1 ? 'hills' : 'treeline';
  return {
    name: `layer ${existing.length + 1}`,
    parallaxFactor: last ? Math.max(0.1, Math.round((last.parallaxFactor - 0.25) * 100) / 100) : 0.85,
    yOffset: 0,
    shape,
    height: shape === 'mountains' ? 45 : shape === 'hills' ? 22 : 14,
    tint: shape === 'mountains' ? '#8da2c2' : shape === 'hills' ? '#6f9a6a' : '#3f6b45',
  };
}

export const newProp = (doodadKey = ''): SurfacePropDef => ({ doodadKey, density: 6, spacing: 4 });

/** Moves item `from` of a list to `to` (returns a new list). Out-of-range moves change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

/**
 * The form as an environment that is always safe to draw in the preview: a number being typed (empty, NaN) takes its default
 * for the moment, and colours that are not valid are kept as sent (the preview only reads good ones).
 */
export function previewEnvironment(f: SurfaceEnvironmentForm, id = 'preview'): SurfaceEnvironmentDefinition {
  const body = formToEnvironment(f);
  const sky = body.sky!;
  return {
    id,
    key: f.key || 'preview',
    name: f.name || 'Preview',
    weight: finite(f.weight, 1),
    isDefault: f.isDefault,
    sky: { ...sky, sunX: finite(f.sunX, 0.7), sunHeight: finite(f.sunHeight, 20), sunSize: finite(f.sunSize, 3) },
    ambientTint: body.ambientTint ?? null,
    layers: (body.layers ?? []).map((l) => ({ ...l, parallaxFactor: finite(l.parallaxFactor, 0.5), yOffset: finite(l.yOffset, 0), height: l.height === undefined ? undefined : finite(l.height, 30), scale: l.scale === undefined ? undefined : finite(l.scale, 1) })),
    clouds: { ...body.clouds, maxCount: Math.max(0, Math.min(24, finite(f.cloudMax, 8))), minHeight: finite(f.cloudMinHeight, 8), maxHeight: finite(f.cloudMaxHeight, 22) },
    weather: body.weather ?? {},
    props: [],
  };
}
