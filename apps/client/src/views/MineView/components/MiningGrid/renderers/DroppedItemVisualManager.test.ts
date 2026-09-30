import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DroppedItemVisualManager } from './DroppedItemVisualManager';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import { SpotLight } from '../../../../../components/game/lighting/SpotLight';
import type { MiningDroppedItem } from '@mine-me/shared';

describe('DroppedItemVisualManager', () => {
  let manager: DroppedItemVisualManager;
  let mockLightingEngine: any;
  let mockParticleEngine: any;
  let mockEmitter: any;

  beforeEach(() => {
    manager = new DroppedItemVisualManager();
    mockLightingEngine = {
      addLight: vi.fn(),
      removeLight: vi.fn(),
    };
    mockEmitter = {
      setPosition: vi.fn(),
      destroy: vi.fn(),
    };
    mockParticleEngine = {
      addEmitter: vi.fn().mockReturnValue(mockEmitter),
    };
  });

  it('correctly parses hex string and numeric colors', () => {
    expect(DroppedItemVisualManager.parseColor('#fbbf24')).toBe(0xfbbf24);
    expect(DroppedItemVisualManager.parseColor('#ffffff')).toBe(0xffffff);
    expect(DroppedItemVisualManager.parseColor(0x38bdf8)).toBe(0x38bdf8);
    expect(DroppedItemVisualManager.parseColor(undefined)).toBe(0xfbbf24);
  });

  it('resolves particle effect configs including pe_ prefixes and custom effects', () => {
    // Built-in default
    const fairySparkle = DroppedItemVisualManager.getEffectConfig('pe_fairy_sparkle');
    expect(fairySparkle).toBeDefined();
    expect(fairySparkle?.emitterType).toBe('continuous');

    // Custom registered effect
    DroppedItemVisualManager.setCustomParticleEffects([
      {
        id: 'custom_gem_glow',
        name: 'Gem Glow',
        config: {
          emitterType: 'continuous',
          rate: 10,
          lifetime: { min: 0.1, max: 0.2 },
          speed: { min: 1, max: 2 },
          scale: { start: 1, end: 0 },
          color: { start: '#ffffff', end: '#000000' },
          alpha: { start: 1, end: 0 },
          blendMode: 'add',
          shape: 'circle',
        } as any,
      },
    ]);

    expect(DroppedItemVisualManager.getEffectConfig('custom_gem_glow')).toBeDefined();
    expect(DroppedItemVisualManager.getEffectConfig('gem_glow')).toBeDefined();
  });

  it('spawns a PointLight with PULSE mode when dropped item has POINT lightConfig', () => {
    const droppedItem: MiningDroppedItem = {
      id: 'drop_sol_1',
      itemId: 'cmund29qj0000qr3nw7owbynf',
      itemName: 'Sol',
      iconUrl: '/assets/icons/items/sol.png',
      quantity: 1,
      position: { x: 5, y: 10 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: {
        enabled: true,
        type: 'POINT',
        effect: 'PULSE',
        color: '#fbbf24',
        radius: 2.0,
        intensity: 0.6,
        pulseSpeed: 3.0,
      },
    };

    manager.update([droppedItem], 0.016, mockParticleEngine, mockLightingEngine);

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight).toBeInstanceOf(PointLight);
    expect(addedLight.id).toBe('dropped_item_light_drop_sol_1');
    expect(addedLight.color).toBe(0xfbbf24);
    expect(addedLight.radius).toBe(2.0);
    expect(addedLight.pulse).toBeDefined();
    expect(addedLight.pulse.speed).toBe(3.0);

    // Also spawned particle emitter
    expect(mockParticleEngine.addEmitter).toHaveBeenCalledTimes(1);
    expect(manager.getActiveLightCount()).toBe(1);
    expect(manager.getActiveEmitterCount()).toBe(1);
  });

  it('spawns a SpotLight when dropped item has SPOT lightConfig', () => {
    const droppedItem: MiningDroppedItem = {
      id: 'drop_flashlight_item',
      itemId: 'item_spot_torch',
      itemName: 'Spot Torch',
      iconUrl: '/assets/icons/items/torch.png',
      quantity: 1,
      position: { x: 12, y: 8 },
      lightConfig: {
        enabled: true,
        type: 'SPOT',
        effect: 'STATIC',
        color: '#ffffff',
        radius: 3.5,
        intensity: 0.8,
        spotAngle: 90,
        spotConeAngle: 60,
      },
    };

    manager.update([droppedItem], 0.016, mockParticleEngine, mockLightingEngine);

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight).toBeInstanceOf(SpotLight);
    expect(addedLight.coneAngleDeg).toBe(60);
    expect(addedLight.color).toBe(0xffffff);
  });

  it('spawns a copper light for Copperium and silver light for Silverium', () => {
    const copperDrop: MiningDroppedItem = {
      id: 'drop_copper_1',
      itemId: 'cmp6aexa30004idpx29gsz12l',
      itemName: 'Copperium',
      iconUrl: '/assets/icons/items/cmp6aexa30004idpx29gsz12l_icon.png',
      inGameSpriteUrl: '/assets/sprites/items/cmp6aexa30004idpx29gsz12l_ingame.png',
      quantity: 1,
      position: { x: 3, y: 4 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: {
        enabled: true,
        type: 'POINT',
        effect: 'PULSE',
        color: '#ea580c',
        radius: 1.6,
        intensity: 0.45,
        pulseSpeed: 2.0,
      },
    };

    const silverDrop: MiningDroppedItem = {
      id: 'drop_silver_1',
      itemId: 'cmp6ammsn0006idpxgnpsnyk1',
      itemName: 'Silverium',
      iconUrl: '/assets/icons/items/cmp6ammsn0006idpxgnpsnyk1_icon.png',
      inGameSpriteUrl: '/assets/sprites/items/cmp6ammsn0006idpxgnpsnyk1_ingame.png',
      quantity: 1,
      position: { x: 7, y: 8 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: {
        enabled: true,
        type: 'POINT',
        effect: 'PULSE',
        color: '#e2e8f0',
        radius: 1.8,
        intensity: 0.5,
        pulseSpeed: 2.5,
      },
    };

    manager.update([copperDrop, silverDrop], 0.016, mockParticleEngine, mockLightingEngine);

    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(2);

    const copperLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(copperLight.id).toBe('dropped_item_light_drop_copper_1');
    expect(copperLight.color).toBe(0xea580c);
    expect(copperLight.radius).toBe(1.6);
    expect(copperLight.pulse.speed).toBe(2.0);

    const silverLight = mockLightingEngine.addLight.mock.calls[1][0];
    expect(silverLight.id).toBe('dropped_item_light_drop_silver_1');
    expect(silverLight.color).toBe(0xe2e8f0);
    expect(silverLight.radius).toBe(1.8);
    expect(silverLight.pulse.speed).toBe(2.5);
  });

  it('updates position of existing light and emitter when item moves', () => {
    const droppedItem: MiningDroppedItem = {
      id: 'drop_sol_1',
      itemId: 'sol',
      itemName: 'Sol',
      iconUrl: '/assets/icons/items/sol.png',
      quantity: 1,
      position: { x: 5, y: 10 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: {
        enabled: true,
        type: 'POINT',
        effect: 'STATIC',
        color: '#fbbf24',
        radius: 1.5,
        intensity: 0.5,
      },
    };

    manager.update([droppedItem], 0.016, mockParticleEngine, mockLightingEngine, 64);

    const addedLight = mockLightingEngine.addLight.mock.calls[0][0];
    expect(addedLight.position.x).toBe(5.5);
    expect(addedLight.position.y).toBe(10.5);

    // Item settles down to y: 11
    const movedItem: MiningDroppedItem = {
      ...droppedItem,
      position: { x: 5, y: 11 },
    };

    manager.update([movedItem], 0.016, mockParticleEngine, mockLightingEngine, 64);

    // Should NOT add a new light
    expect(mockLightingEngine.addLight).toHaveBeenCalledTimes(1);
    expect(addedLight.position.y).toBe(11.5);
    expect(mockEmitter.setPosition).toHaveBeenCalledWith({ x: 5.5 * 64, y: 11.5 * 64 });
  });

  it('cleans up light and emitter when item is picked up (no longer dropped)', () => {
    const droppedItem: MiningDroppedItem = {
      id: 'drop_sol_1',
      itemId: 'sol',
      itemName: 'Sol',
      iconUrl: '/assets/icons/items/sol.png',
      quantity: 1,
      position: { x: 5, y: 10 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: {
        enabled: true,
        type: 'POINT',
        effect: 'PULSE',
        color: '#fbbf24',
        radius: 1.8,
        intensity: 0.5,
      },
    };

    manager.update([droppedItem], 0.016, mockParticleEngine, mockLightingEngine);
    expect(manager.getActiveLightCount()).toBe(1);
    expect(manager.getActiveEmitterCount()).toBe(1);

    // Item is picked up -> empty array
    manager.update([], 0.016, mockParticleEngine, mockLightingEngine);

    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('dropped_item_light_drop_sol_1');
    expect(mockEmitter.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getActiveLightCount()).toBe(0);
    expect(manager.getActiveEmitterCount()).toBe(0);
  });

  it('destroys all resources on destroy()', () => {
    const item1: MiningDroppedItem = {
      id: 'drop_1',
      itemId: 'sol',
      itemName: 'Sol',
      iconUrl: '/assets/icons/items/sol.png',
      quantity: 1,
      position: { x: 1, y: 1 },
      particleEffectId: 'pe_fairy_sparkle',
      lightConfig: { enabled: true, type: 'POINT', effect: 'STATIC', color: '#fbbf24', radius: 1, intensity: 0.5 },
    };
    const item2: MiningDroppedItem = {
      id: 'drop_2',
      itemId: 'torch',
      itemName: 'Torch',
      iconUrl: '/assets/icons/items/torch.png',
      quantity: 1,
      position: { x: 2, y: 2 },
      lightConfig: { enabled: true, type: 'SPOT', effect: 'STATIC', color: '#ffffff', radius: 2, intensity: 0.8 },
    };

    manager.update([item1, item2], 0.016, mockParticleEngine, mockLightingEngine);
    expect(manager.getActiveLightCount()).toBe(2);
    expect(manager.getActiveEmitterCount()).toBe(1);

    manager.destroy(mockParticleEngine, mockLightingEngine);

    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('dropped_item_light_drop_1');
    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('dropped_item_light_drop_2');
    expect(mockEmitter.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getActiveLightCount()).toBe(0);
    expect(manager.getActiveEmitterCount()).toBe(0);
  });
});
