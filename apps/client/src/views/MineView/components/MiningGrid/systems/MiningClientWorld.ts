import type { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type {
  GameItem,
  MiningActiveDynamite,
  MiningActiveProjectile,
  MiningClientTile,
  MiningDroppedItem,
  MiningInputState,
  MiningPlayerBody,
  MiningPosition,
  MiningTileType,
  ParticleEffectConfig,
  Vector2D,
} from '@mine-me/shared';
import type { ModularCharacterSprite } from '../../../../../components/game/sprites';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { Camera2D } from '../../../../../components/game/camera/Camera2D';
import type { EmitterHandle, ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { MiningMouseController } from '../input/MiningMouseController';
import type { MiningRemotePlayerRenderer } from '../renderers/MiningRemotePlayerRenderer';
import type { MiningMobRenderer } from '../renderers/MiningMobRenderer';
import type { DoodadRenderer } from '../renderers/DoodadRenderer';
import type { DoodadEffects } from './DoodadEffects';
import type { DoodadSounds } from './DoodadSounds';
import type { SurfaceSystem } from '../surface/SurfaceSystem';
import type { DoodadField, FireField } from '@mine-me/shared';
import type { FluidRenderer } from '../renderers/FluidRenderer';
import type { GasRenderer } from '../renderers/GasRenderer';
import type { ExtractorRenderer } from '../renderers/ExtractorRenderer';
import type { BeltRenderer } from '../renderers/BeltRenderer';
import type { BeltItemRenderer } from '../renderers/BeltItemRenderer';
import type { ExtractorSounds } from '../renderers/ExtractorSounds';
import type { FireRenderer } from '../renderers/FireRenderer';
import type { FluidGlow } from '../renderers/FluidGlow';
import type { BiomeAmbient } from './BiomeAmbient';
import type { BurningBodies } from '../renderers/BurningBodies';
import type { FluidSounds } from '../renderers/FluidSounds';
import type { GasSounds } from '../renderers/GasSounds';
import type { ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { ProjectileTextureCache } from './ProjectileTextureCache';
import type { MiningPredictionState } from './MiningPredictionState';
import type { CharacterSoundPlayer } from './CharacterSoundPlayer';
import type { FreeCamera } from './FreeCamera';

type Ref<T> = React.MutableRefObject<T>;
type NullableRef<T> = React.RefObject<T | null>;

/** The local player and the simulated state around them. */
export interface MiningSimulationRefs {
  gridRef: Ref<MiningClientTile[][]>;
  playerBodyRef: Ref<MiningPlayerBody>;
  predictionRef: Ref<MiningPredictionState | null>;
  keysPressedRef: Ref<MiningInputState>;
  isMiningRef: Ref<boolean>;
  miningTargetRef: Ref<MiningPosition | null>;
  currentRenderPosRef: Ref<Vector2D>;
  targetServerPosRef: Ref<Vector2D>;
  isFacingLeftRef: Ref<boolean>;
  playerFacingDirRef: Ref<Vector2D>;
  showDebugRef: Ref<boolean>;
  mouseControllerRef: Ref<MiningMouseController>;
  /** Plays the player character's hurt/jump/land/death sounds. */
  characterSoundsRef: Ref<CharacterSoundPlayer>;
}

/** Entities and items as last reported by the server. */
export interface MiningEntityRefs {
  activeFallingRocksRef: Ref<ActiveFallingRock[]>;
  activeDynamitesRef: Ref<MiningActiveDynamite[]>;
  activeProjectilesRef: Ref<MiningActiveProjectile[]>;
  droppedItemsRef: Ref<MiningDroppedItem[]>;
  dynamicItemsRef: Ref<GameItem[]>;
  weaponAmmoStateRef: Ref<{ current: number; max: number; isReloading: boolean }>;
  weaponSoundUrlRef: Ref<string | null>;
  /** Volume (0 to 1) set on the weapon for the sound in `weaponSoundUrlRef`. */
  weaponSoundVolumeRef: Ref<number>;
  lastWeaponSoundTimeRef: Ref<number>;
}

/** Pixi containers, sprite maps, textures, renderers and engines. */
export interface MiningSceneRefs {
  cameraRef: NullableRef<Camera2D>;
  /** The sandbox's detachable camera (absent outside the sandbox). */
  freeCameraRef?: Ref<FreeCamera>;
  gridContainerRef: NullableRef<Container>;
  tilesContainerRef: NullableRef<Container>;
  /** Draws the fluid the server has revealed (and holds the client's copy of the fluid grid). */
  fluidRendererRef: NullableRef<FluidRenderer>;
  /** Draws the gas the server has revealed (and holds the client's copy of the gas grid). */
  gasRendererRef?: NullableRef<GasRenderer>;
  /** The extractor on the surface and its landing intro (absent in modes without one). */
  extractorRendererRef?: NullableRef<ExtractorRenderer>;
  /** The conveyor belt going down from the extractor (absent in modes without one). */
  beltRendererRef?: NullableRef<BeltRenderer>;
  /** The items riding the belt. */
  beltItemRendererRef?: NullableRef<BeltItemRenderer>;
  /** The extractor's sounds: items going onto the belt, and the running loop. */
  extractorSoundsRef?: NullableRef<ExtractorSounds>;
  /** Which visible cells are on fire, as the server last said (ticket 061 draws it). */
  fireFieldRef: NullableRef<FireField>;
  /** The doodads the server has revealed, kept up to date by the tick handlers (absent before the scene is built). */
  doodadFieldRef?: NullableRef<DoodadField>;
  /** Draws the doodads (ticket 102). */
  doodadRendererRef?: NullableRef<DoodadRenderer>;
  /** The lights and particles the doodads give off (ticket 103). */
  doodadEffectsRef?: NullableRef<DoodadEffects>;
  /** What the doodads sound like (ticket 103). */
  doodadSoundsRef?: NullableRef<DoodadSounds>;
  /** The sky, scenery, clouds and weather above the ground (tickets 129-135); absent when the mine has no surface to show. */
  surfaceSystemRef?: NullableRef<SurfaceSystem>;
  /** Flames and lights on the burning cells. */
  fireRendererRef: NullableRef<FireRenderer>;
  /** The ambient look that follows the biome the player is in (absent when the mine is one biome). */
  biomeAmbientRef?: NullableRef<BiomeAmbient>;
  /** The light fluids give off all the time (lava). */
  fluidGlowRef?: NullableRef<FluidGlow>;
  /** The effect on burning players and mobs. */
  burningBodiesRef: NullableRef<BurningBodies>;
  /** Splashes, fire catching and the crackle loops. */
  fluidSoundsRef: NullableRef<FluidSounds>;
  /** Gas sounds: walking into a cloud, ignition, the boom and the venting. */
  gasSoundsRef?: NullableRef<GasSounds>;
  fallingRocksContainerRef: NullableRef<Container>;
  droppedItemsContainerRef: NullableRef<Container>;
  dynamitesContainerRef: NullableRef<Container>;
  projectilesContainerRef: NullableRef<Container>;
  playerContainerRef: NullableRef<Container>;
  reticleGraphicsRef: NullableRef<Graphics>;
  debugGraphicsRef: NullableRef<Graphics>;
  tileGraphicsMap: Ref<Map<string, Graphics>>;
  tileSpritesMap: Ref<Map<string, Sprite>>;
  droppedSpritesMap: NullableRef<Map<string, Sprite | Graphics>>;
  fallingRockGraphicsMap: Ref<Map<string, Sprite | Graphics>>;
  dynamiteGraphicsMap: Ref<Map<string, Sprite | Graphics>>;
  projectileGraphicsMap: Ref<Map<string, Sprite | Graphics>>;
  blockTexturesRef: Ref<Map<number, Texture>>;
  dynamiteTextureRef: NullableRef<Texture>;
  projectileTexturesRef: NullableRef<ProjectileTextureCache>;
  blockParticleConfigsRef: Ref<Map<MiningTileType, ParticleEffectConfig>>;
  /** The mining sound of each block type, with the volume set on that block. */
  blockSoundsRef: Ref<Map<number, { url: string; volume: number }>>;
  playerSpriteRef: NullableRef<ModularCharacterSprite>;
  remotePlayerRendererRef: NullableRef<MiningRemotePlayerRenderer>;
  mobRendererRef: NullableRef<MiningMobRenderer>;
  lightingEngineRef: NullableRef<LightingEngine>;
  flashlightRef: NullableRef<SpotLight>;
  particleEngineRef: NullableRef<ParticleEngine>;
  dynamiteVisualManagerRef: NullableRef<DynamiteVisualManager>;
  projectileVisualManagerRef: NullableRef<ProjectileVisualManager>;
  droppedItemVisualManagerRef: NullableRef<DroppedItemVisualManager>;
  torchEmittersRef: Ref<Map<string, EmitterHandle>>;
  blockEmittersRef: Ref<Map<string, EmitterHandle>>;
}

/**
 * Everything the mining view's systems share, in one object. Hooks take the world instead of a
 * long list of refs, so adding a system or a piece of state does not mean threading it through
 * every hook's options. All members are refs (stable for the life of the view), so the object is
 * cheap to rebuild every render and safe to read inside effects.
 */
export interface MiningClientWorld extends MiningSimulationRefs, MiningEntityRefs, MiningSceneRefs {}
