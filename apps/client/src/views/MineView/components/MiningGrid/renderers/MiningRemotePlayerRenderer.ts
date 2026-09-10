import { Container, Text } from 'pixi.js';
import { ModularCharacterSprite, type GearLayerDescriptor } from '../../../../../components/game/sprites';
import { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { MINING_CONFIG, type MiningRemotePlayer, type Vector2D } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

export interface RemotePlayerInstance {
  characterId: string;
  characterName: string;
  container: Container;
  sprite: ModularCharacterSprite;
  nameplate: Text;
  targetPos: Vector2D;
  currentPos: Vector2D;
  isFacingLeft: boolean;
  animationState: string;
  gearLayersHash: string;
  isLoaded: boolean;
  flashlight: SpotLight;
  targetAim: Vector2D;
  currentAim: Vector2D;
  flashlightOn: boolean;
}

/**
 * Manages Pixi rendering, skeletal sprite instances, position interpolation,
 * directional flashlights, and nameplates for remote players in a shared mining session.
 */
export class MiningRemotePlayerRenderer {
  private parentContainer: Container;
  private lightingEngine: LightingEngine | null = null;
  private players: Map<string, RemotePlayerInstance> = new Map();

  constructor(parentContainer: Container, lightingEngine?: LightingEngine | null) {
    this.parentContainer = parentContainer;
    this.lightingEngine = lightingEngine ?? null;
  }

  public setLightingEngine(lightingEngine: LightingEngine | null): void {
    this.lightingEngine = lightingEngine;
    if (this.lightingEngine) {
      for (const instance of this.players.values()) {
        this.lightingEngine.addLight(instance.flashlight);
      }
    }
  }

  public getLightingEngine(): LightingEngine | null {
    return this.lightingEngine;
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public getPlayer(characterId: string): RemotePlayerInstance | undefined {
    return this.players.get(characterId);
  }

  /**
   * Sync active remote players from server tick or session state.
   */
  public updatePlayers(remotePlayers?: MiningRemotePlayer[]): void {
    if (!remotePlayers || remotePlayers.length === 0) {
      // Remove all if list is empty
      for (const [id, instance] of this.players) {
        this.removePlayer(id, instance);
      }
      return;
    }

    const currentIds = new Set(remotePlayers.map((p) => p.characterId));

    // 1. Remove players no longer present
    for (const [id, instance] of this.players) {
      if (!currentIds.has(id)) {
        this.removePlayer(id, instance);
      }
    }

    // 2. Add or update existing players
    for (const playerData of remotePlayers) {
      let instance = this.players.get(playerData.characterId);
      const gearLayers = (playerData.gearLayers || []) as GearLayerDescriptor[];
      const gearHash = JSON.stringify(gearLayers);

      if (!instance) {
        // Create new player container & sprite
        const playerCont = new Container();
        playerCont.x = playerData.position.x * TILE_SIZE;
        playerCont.y = playerData.position.y * TILE_SIZE;

        const nameplate = new Text({
          text: playerData.characterName || 'Miner',
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 9,
            fontWeight: 'bold',
            fill: '#38bdf8',
            stroke: {
              color: '#0f172a',
              width: 2.5,
            },
          },
        });
        nameplate.anchor.set(0.5, 1);
        nameplate.position.set(0, -20);
        playerCont.addChild(nameplate);

        const sprite = new ModularCharacterSprite(playerCont);

        const initialAim = playerData.aimDirection
          ? { ...playerData.aimDirection }
          : playerData.isFacingLeft
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };
        const isLightOn = playerData.flashlightOn ?? false;

        const flashlight = new SpotLight(
          `remote_flashlight_${playerData.characterId}`,
          { x: playerData.position.x, y: playerData.position.y - 0.28 },
          initialAim
        );
        flashlight.enabled = isLightOn;
        if (this.lightingEngine) {
          this.lightingEngine.addLight(flashlight);
        }

        instance = {
          characterId: playerData.characterId,
          characterName: playerData.characterName,
          container: playerCont,
          sprite,
          nameplate,
          targetPos: { ...playerData.position },
          currentPos: { ...playerData.position },
          isFacingLeft: playerData.isFacingLeft,
          animationState: playerData.animationState,
          gearLayersHash: gearHash,
          isLoaded: false,
          flashlight,
          targetAim: { ...initialAim },
          currentAim: { ...initialAim },
          flashlightOn: isLightOn,
        };

        this.players.set(playerData.characterId, instance);
        this.parentContainer.addChild(playerCont);

        // Load skeletal puppet in background
        sprite
          .load()
          .then(async () => {
            if (!this.players.has(playerData.characterId)) return;
            if (gearLayers.length > 0) {
              await sprite.setGearLayers(gearLayers);
            }

            const targetHeight = TILE_SIZE * 1.08;
            sprite.scaleToHeight(targetHeight);

            const unscaledFootDepth = 426;
            const visualGroundOffset = 15;
            const footOffset =
              MINING_CONFIG.PLAYER_RADIUS -
              unscaledFootDepth * (targetHeight / ModularCharacterSprite.REFERENCE_HEIGHT) +
              visualGroundOffset;
            sprite.setPosition(0, footOffset);

            sprite.setFlipped(instance!.isFacingLeft);
            sprite.setVisible(true);
            instance!.isLoaded = true;
          })
          .catch((err) => {
            console.error('[MiningRemotePlayerRenderer] Error loading sprite for', playerData.characterId, err);
          });
      } else {
        // Update existing player state
        instance.targetPos.x = playerData.position.x;
        instance.targetPos.y = playerData.position.y;
        instance.isFacingLeft = playerData.isFacingLeft;
        instance.animationState = playerData.animationState;

        if (playerData.aimDirection) {
          instance.targetAim.x = playerData.aimDirection.x;
          instance.targetAim.y = playerData.aimDirection.y;
        } else {
          instance.targetAim.x = playerData.isFacingLeft ? -1 : 1;
          instance.targetAim.y = 0;
        }
        instance.flashlightOn = playerData.flashlightOn ?? false;
        instance.flashlight.enabled = instance.flashlightOn;

        // Check if gear layers changed mid-game
        if (instance.gearLayersHash !== gearHash) {
          instance.gearLayersHash = gearHash;
          if (instance.isLoaded) {
            instance.sprite.setGearLayers(gearLayers).catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Per-frame smooth interpolation and animation update for all remote players.
   */
  public tick(dt: number): void {
    const smoothFactor = Math.min(1.0, 1 - Math.exp(-24 * dt));
    const smoothAimFactor = Math.min(1.0, 1 - Math.exp(-20 * dt));

    for (const instance of this.players.values()) {
      // Lerp position towards target
      instance.currentPos.x += (instance.targetPos.x - instance.currentPos.x) * smoothFactor;
      instance.currentPos.y += (instance.targetPos.y - instance.currentPos.y) * smoothFactor;

      // Lerp aim direction towards target
      instance.currentAim.x += (instance.targetAim.x - instance.currentAim.x) * smoothAimFactor;
      instance.currentAim.y += (instance.targetAim.y - instance.currentAim.y) * smoothAimFactor;

      // Position and direct remote flashlight at headlamp level
      instance.flashlight.setPosition(instance.currentPos.x, instance.currentPos.y - 0.28);
      instance.flashlight.setDirection(instance.currentAim.x, instance.currentAim.y);
      instance.flashlight.enabled = instance.flashlightOn;

      instance.container.x = instance.currentPos.x * TILE_SIZE;
      instance.container.y = instance.currentPos.y * TILE_SIZE;

      if (instance.isLoaded) {
        instance.sprite.setFlipped(instance.isFacingLeft);
        instance.sprite.setState(instance.animationState as any);
        instance.sprite.update(dt);
      }
    }
  }

  private removePlayer(id: string, instance: RemotePlayerInstance): void {
    this.players.delete(id);
    if (this.lightingEngine) {
      this.lightingEngine.removeLight(instance.flashlight.id);
    }
    try {
      this.parentContainer.removeChild(instance.container);
      instance.sprite.destroy();
      instance.container.destroy({ children: true });
    } catch {
      // Ignore destruction errors
    }
  }

  public destroy(): void {
    for (const [id, instance] of this.players) {
      this.removePlayer(id, instance);
    }
  }
}
