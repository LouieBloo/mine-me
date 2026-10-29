import type { SandboxMobOption, WeatherId } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';

/**
 * Named test scenes for the surface (ticket 138, like the fluid, extractor and doodad scenes): each one forces a weather so a
 * look, a sound or a cost can be reproduced from the same starting point every time. Scenes only use the room's own surface
 * state, the same one the seeded weather runs on.
 */
export interface SurfaceScene {
  id: string;
  name: string;
  description: string;
  weather: WeatherId | null;
  intensity?: number;
  /** Calls a lightning strike as the scene loads. */
  strike?: boolean;
}

export const SURFACE_SCENES: readonly SurfaceScene[] = [
  { id: 'clear-day', name: 'Clear day', description: 'Blue sky, a few thin clouds, light wind.', weather: 'clear' },
  { id: 'heavy-rain', name: 'Heavy rain', description: 'Dark clouds and rain at full strength, no lightning.', weather: 'rain', intensity: 1 },
  { id: 'storm', name: 'Storm with lightning', description: 'Rain, wind, dark sky and a lightning strike every few seconds with thunder.', weather: 'storm', strike: true },
  { id: 'snow', name: 'Snow', description: 'Falling snow in cold light.', weather: 'snow' },
  { id: 'fog', name: 'Fog', description: 'Soft fog banks over the horizon.', weather: 'fog' },
  { id: 'gale', name: 'Gale', description: 'Strong wind: clouds race, the trees and grass sway hard.', weather: 'windy', intensity: 1 },
  { id: 'seeded', name: 'Back to the seeded weather', description: 'Stops forcing the weather: it follows the run seed again.', weather: null },
];

export const SURFACE_SCENE_OPTIONS: readonly SandboxMobOption[] = SURFACE_SCENES.map((scene) => ({ id: scene.id, name: scene.name }));

export const findSurfaceScene = (id: unknown): SurfaceScene | undefined => SURFACE_SCENES.find((scene) => scene.id === id);

/** Puts a scene on the room's surface. */
export function applySurfaceScene(engine: MiningGameEngine, scene: SurfaceScene): void {
  engine.surface.forceWeather(scene.weather, scene.intensity);
  if (scene.strike) engine.surface.triggerLightning();
}
