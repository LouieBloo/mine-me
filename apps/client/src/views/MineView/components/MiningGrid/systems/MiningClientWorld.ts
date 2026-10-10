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
import type { ActiveFallingRock } from '../renderers/MiningEntityRenderer';
import type { DynamiteVisualManager } from '../renderers/DynamiteVisualManager';
import type { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { ProjectileVisualManager } from '../renderers/ProjectileVisualManager';
import type { ProjectileTextureCache } from './ProjectileTextureCache';
import type { MiningPredictionState } from './MiningPredictionState';

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
  lastWeaponSoundTimeRef: Ref<number>;
}

/** Pixi containers, sprite maps, textures, renderers and engines. */
export interface MiningSceneRefs {
  cameraRef: NullableRef<Camera2D>;
  gridContainerRef: NullableRef<Container>;
  tilesContainerRef: NullableRef<Container>;
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
  blockSoundsRef: Ref<Map<number, string>>;
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
