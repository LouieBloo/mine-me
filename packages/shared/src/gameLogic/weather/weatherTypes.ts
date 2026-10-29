import type { SurfaceSoundSlot, WeatherId } from '../../types';

/**
 * What each kind of weather is (ticket 132). A new weather type is an entry here, never a conditional somewhere else:
 * the schedule, the clouds, the rain, the light and the sounds all read these numbers. Intensities run from 0 to 1.
 */
export interface WeatherTypeDef {
  id: WeatherId;
  label: string;
  /** How much of the sky the clouds fill. */
  cloudDensity: number;
  /** How dark and grey the clouds are. */
  cloudDarkness: number;
  rain: number;
  snow: number;
  fog: number;
  /** Wind strength: sways the surface doodads and the precipitation, and drives the wind loop. */
  wind: number;
  /** How much the surface light is dimmed. */
  dim: number;
  /** CSS hex colour the surface light is tinted with (null: none). */
  tint: string | null;
  /** How likely lightning is (0 = never). */
  lightning: number;
  /** Which sound slots this weather uses (the loops follow the intensities; thunder follows the strikes). */
  sounds: SurfaceSoundSlot[];
  /** Which weather it can drift into next (the schedule only walks between neighbours, so clear never jumps to storm). */
  neighbours: WeatherId[];
}

export const WEATHER_TYPES: Readonly<Record<WeatherId, WeatherTypeDef>> = {
  clear: { id: 'clear', label: 'Clear', cloudDensity: 0.15, cloudDarkness: 0, rain: 0, snow: 0, fog: 0, wind: 0.12, dim: 0, tint: null, lightning: 0, sounds: ['wind'], neighbours: ['cloudy', 'windy', 'fog'] },
  cloudy: { id: 'cloudy', label: 'Cloudy', cloudDensity: 0.65, cloudDarkness: 0.25, rain: 0, snow: 0, fog: 0, wind: 0.3, dim: 0.12, tint: null, lightning: 0, sounds: ['wind'], neighbours: ['clear', 'windy', 'rain', 'snow', 'fog'] },
  windy: { id: 'windy', label: 'Windy', cloudDensity: 0.4, cloudDarkness: 0.1, rain: 0, snow: 0, fog: 0, wind: 0.9, dim: 0.05, tint: null, lightning: 0, sounds: ['wind'], neighbours: ['clear', 'cloudy', 'rain'] },
  rain: { id: 'rain', label: 'Rain', cloudDensity: 0.85, cloudDarkness: 0.55, rain: 0.7, snow: 0, fog: 0.05, wind: 0.45, dim: 0.3, tint: '#8c9bb0', lightning: 0, sounds: ['rain', 'wind'], neighbours: ['cloudy', 'storm', 'windy'] },
  storm: { id: 'storm', label: 'Storm', cloudDensity: 1, cloudDarkness: 0.85, rain: 1, snow: 0, fog: 0.1, wind: 0.8, dim: 0.5, tint: '#6f7d96', lightning: 1, sounds: ['rain', 'wind', 'thunder'], neighbours: ['rain', 'cloudy'] },
  snow: { id: 'snow', label: 'Snow', cloudDensity: 0.7, cloudDarkness: 0.3, rain: 0, snow: 0.8, fog: 0.1, wind: 0.25, dim: 0.2, tint: '#dfe9ff', lightning: 0, sounds: ['wind'], neighbours: ['cloudy', 'fog'] },
  fog: { id: 'fog', label: 'Fog', cloudDensity: 0.5, cloudDarkness: 0.15, rain: 0, snow: 0, fog: 0.85, wind: 0.05, dim: 0.22, tint: '#cfd6dc', lightning: 0, sounds: ['wind'], neighbours: ['clear', 'cloudy', 'snow'] },
};

export const WEATHER_IDS: readonly WeatherId[] = Object.keys(WEATHER_TYPES) as WeatherId[];

export function isWeatherId(value: unknown): value is WeatherId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEATHER_TYPES, value);
}
