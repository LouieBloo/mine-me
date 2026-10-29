import type { SurfaceSoundEffectsConfig, SurfaceSoundSlotRefs } from './sound';

/**
 * The surface above the ground (tickets 129-138): sky, scenery, clouds, weather and props. An environment is a row, like a
 * biome or a fluid; nothing in logic names one. All of it is cosmetic.
 */

/** The weather states (the registry in `gameLogic/weather/weatherTypes.ts` says what each one does). */
export type WeatherId = 'clear' | 'cloudy' | 'windy' | 'rain' | 'storm' | 'snow' | 'fog';

/** How a layer without a picture is drawn: a pale silhouette along the horizon. */
export type SurfaceLayerShape = 'mountains' | 'hills' | 'treeline' | 'flat';

/** One strip of scenery along the horizon (far mountains, nearer hills...). */
export interface SurfaceLayerDef {
  name: string;
  /** Tileable strip, an `/assets/...` url. Null: the silhouette `shape` is drawn instead. */
  textureUrl?: string | null;
  /** 0 = moves with the terrain, 1 = fixed to the screen (the farther, the nearer 1). */
  parallaxFactor: number;
  /** Blocks the layer's bottom edge sits below the horizon (negative: above it). Small blocks. */
  yOffset: number;
  /** CSS hex colour multiplied into the picture (or the silhouette's colour when there is no picture). */
  tint?: string | null;
  /** Picture scale (1 = as made). */
  scale?: number;
  /** Silhouette used when there is no picture. */
  shape?: SurfaceLayerShape;
  /** Silhouette height, in small blocks. */
  height?: number;
  /** 0 to 1 (1 when absent). */
  alpha?: number;
}

/** The sky: a gradient from the top of the screen to the horizon, and a sun. */
export interface SurfaceSkyDef {
  /** CSS hex colours. */
  top: string;
  horizon: string;
  /** The sun's colour (null/absent: no sun). */
  sunColor?: string | null;
  /** Where the sun sits along the map, 0 to 1. */
  sunX?: number;
  /** How high above the horizon, in small blocks. */
  sunHeight?: number;
  /** Radius in small blocks. */
  sunSize?: number;
}

/** The clouds that drift across the sky. */
export interface SurfaceCloudsDef {
  /** Cloud pictures, `/assets/...` urls (white; they are darkened by the weather). Empty: soft shapes are drawn. */
  textureUrls?: string[];
  /** The most clouds in the sky at once (the weather decides how many of them show). */
  maxCount?: number;
  /** Height band above the horizon, in small blocks. */
  minHeight?: number;
  maxHeight?: number;
}

/** A doodad the surface gets: trees and bushes on the ground, birds in the air. */
export interface SurfacePropDef {
  /** The doodad's key. */
  doodadKey: string;
  /** How many per 100 columns of ground (flocks for an air doodad). */
  density: number;
  /** Least gap between two of them, in small blocks. */
  spacing?: number;
  /** For an air doodad: how high above the ground it may be, in small blocks. */
  minHeight?: number;
  maxHeight?: number;
}

/** A surface environment as stored in the database and used by the generator and the client. */
export interface SurfaceEnvironmentDefinition {
  id: string;
  /** Open unique key, e.g. 'green_valley'. */
  key: string;
  name: string;
  description?: string | null;
  /** Chance weight when a run picks one. */
  weight: number;
  /** The one used when nothing else can be picked (exactly one row has it). */
  isDefault?: boolean;
  sky: SurfaceSkyDef;
  /** CSS hex colour the sky light is tinted with (null/absent: none). Multiplied into the ambient light above the ground. */
  ambientTint?: string | null;
  layers: SurfaceLayerDef[];
  clouds?: SurfaceCloudsDef | null;
  /** Weather id -> chance weight. Empty/absent: always clear. */
  weather?: Partial<Record<WeatherId, number>> | null;
  props?: SurfacePropDef[];
  /** Sound slots as stored: library sounds by id, each with its own volume. */
  soundEffects?: SurfaceSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: SurfaceSoundEffectsConfig | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** What the sandbox does to the surface on top of the seed: force a weather state, or flash a strike. */
export interface SurfaceOverride {
  /** Always this weather (null/absent: the seeded schedule). */
  weather?: WeatherId | null;
  /** How strong the forced weather is, 0 to 1 (1 when absent). */
  intensity?: number;
  /** Weather-clock seconds a strike was called for (the sandbox button). */
  strikeAt?: number | null;
}

/** The surface as a client is told about it: the environment, and the clock the weather runs on. */
export interface SurfaceClientState {
  environment: SurfaceEnvironmentDefinition;
  /** The run's seed (the weather and the clouds are pure functions of it and the time). */
  seed: number;
  /** Server time (ms since epoch) when the weather clock started. */
  startedAt: number;
  /** Server time (ms since epoch) when this was sent: the client works out its clock offset from it. */
  serverNow: number;
  override?: SurfaceOverride | null;
}

/** A change to the surface that arrives in a state tick (the sandbox swapped the environment or forced the weather). */
export interface SurfaceUpdateWire {
  environment?: SurfaceEnvironmentDefinition;
  override?: SurfaceOverride | null;
  serverNow: number;
}
