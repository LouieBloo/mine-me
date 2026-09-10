import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { MiningRemotePlayerRenderer } from './MiningRemotePlayerRenderer';
import type { MiningRemotePlayer } from '@mine-me/shared';

// Mock ModularCharacterSprite
vi.mock('../../../../../components/game/sprites', () => {
  class MockModularCharacterSprite {
    load = vi.fn().mockResolvedValue(undefined);
    setGearLayers = vi.fn().mockResolvedValue(undefined);
    scaleToHeight = vi.fn();
    setPosition = vi.fn();
    setFlipped = vi.fn();
    setState = vi.fn();
    setVisible = vi.fn();
    update = vi.fn();
    destroy = vi.fn();
    static REFERENCE_HEIGHT = 500;
  }
  return {
    ModularCharacterSprite: MockModularCharacterSprite,
  };
});

describe('MiningRemotePlayerRenderer', () => {
  let parentContainer: Container;
  let renderer: MiningRemotePlayerRenderer;

  beforeEach(() => {
    parentContainer = new Container();
    renderer = new MiningRemotePlayerRenderer(parentContainer);
  });

  it('initializes with 0 players', () => {
    expect(renderer.getPlayerCount()).toBe(0);
  });

  it('adds remote players and mounts their containers to parent', () => {
    const players: MiningRemotePlayer[] = [
      {
        characterId: 'char-1',
        characterName: 'Miner Alice',
        position: { x: 10, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        animationState: 'idle',
      },
      {
        characterId: 'char-2',
        characterName: 'Miner Bob',
        position: { x: 12, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: true,
        isFacingLeft: true,
        animationState: 'mine',
      },
    ];

    renderer.updatePlayers(players);
    expect(renderer.getPlayerCount()).toBe(2);

    const alice = renderer.getPlayer('char-1');
    expect(alice).toBeDefined();
    expect(alice?.characterName).toBe('Miner Alice');
    expect(alice?.targetPos).toEqual({ x: 10, y: 5 });

    const bob = renderer.getPlayer('char-2');
    expect(bob).toBeDefined();
    expect(bob?.characterName).toBe('Miner Bob');
    expect(bob?.isFacingLeft).toBe(true);
    expect(bob?.animationState).toBe('mine');
  });

  it('updates existing player position and removes departed players', () => {
    const initialPlayers: MiningRemotePlayer[] = [
      {
        characterId: 'char-1',
        characterName: 'Miner Alice',
        position: { x: 10, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        animationState: 'idle',
      },
      {
        characterId: 'char-2',
        characterName: 'Miner Bob',
        position: { x: 12, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        animationState: 'idle',
      },
    ];

    renderer.updatePlayers(initialPlayers);
    expect(renderer.getPlayerCount()).toBe(2);

    // Update: Bob moved, Alice left
    const updatedPlayers: MiningRemotePlayer[] = [
      {
        characterId: 'char-2',
        characterName: 'Miner Bob',
        position: { x: 15, y: 8 },
        velocity: { x: 2, y: 0 },
        isMining: true,
        isFacingLeft: true,
        animationState: 'walk',
      },
    ];

    renderer.updatePlayers(updatedPlayers);
    expect(renderer.getPlayerCount()).toBe(1);
    expect(renderer.getPlayer('char-1')).toBeUndefined();

    const bob = renderer.getPlayer('char-2');
    expect(bob).toBeDefined();
    expect(bob?.targetPos).toEqual({ x: 15, y: 8 });
    expect(bob?.isFacingLeft).toBe(true);
    expect(bob?.animationState).toBe('walk');
  });

  it('smoothly interpolates position in tick', () => {
    const players: MiningRemotePlayer[] = [
      {
        characterId: 'char-1',
        characterName: 'Miner Alice',
        position: { x: 10, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        animationState: 'idle',
      },
    ];

    renderer.updatePlayers(players);
    const alice = renderer.getPlayer('char-1')!;

    // Move target to x: 20
    alice.targetPos = { x: 20, y: 5 };

    // Advance 0.05s tick
    renderer.tick(0.05);

    expect(alice.currentPos.x).toBeGreaterThan(10);
    expect(alice.currentPos.x).toBeLessThan(20);
  });

  it('updates loaded player sprite animation with delta time in seconds', () => {
    const players: MiningRemotePlayer[] = [
      {
        characterId: 'char-anim',
        characterName: 'Miner Dave',
        position: { x: 5, y: 5 },
        velocity: { x: 1, y: 0 },
        isMining: false,
        isFacingLeft: true,
        animationState: 'walk',
      },
    ];

    renderer.updatePlayers(players);
    const dave = renderer.getPlayer('char-anim')!;
    dave.isLoaded = true;

    renderer.tick(0.016);

    expect(dave.sprite.setState).toHaveBeenCalledWith('walk');
    expect(dave.sprite.setFlipped).toHaveBeenCalledWith(true);
    expect(dave.sprite.update).toHaveBeenCalledWith(0.016);
  });

  it('manages remote player flashlights via LightingEngine', () => {
    const mockLightingEngine: any = {
      addLight: vi.fn(),
      removeLight: vi.fn(),
    };

    renderer.setLightingEngine(mockLightingEngine);

    const players: MiningRemotePlayer[] = [
      {
        characterId: 'char-light-1',
        characterName: 'Flash Miner',
        position: { x: 8, y: 12 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: true,
        aimDirection: { x: -0.707, y: 0.707 },
        flashlightOn: true,
        animationState: 'idle',
      },
    ];

    renderer.updatePlayers(players);
    expect(mockLightingEngine.addLight).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remote_flashlight_char-light-1',
        enabled: true,
      })
    );

    const player = renderer.getPlayer('char-light-1')!;
    expect(player.flashlight.enabled).toBe(true);
    expect(player.flashlight.direction.x).toBeCloseTo(-0.707, 2);
    expect(player.flashlight.direction.y).toBeCloseTo(0.707, 2);

    // Update aim and toggle flashlight off
    renderer.updatePlayers([
      {
        characterId: 'char-light-1',
        characterName: 'Flash Miner',
        position: { x: 8, y: 12 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        aimDirection: { x: 1, y: 0 },
        flashlightOn: false,
        animationState: 'idle',
      },
    ]);

    expect(player.flashlight.enabled).toBe(false);
    expect(player.targetAim).toEqual({ x: 1, y: 0 });

    // Remove player -> flashlight should be removed from lighting engine
    renderer.updatePlayers([]);
    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('remote_flashlight_char-light-1');
  });

  it('cleans up all players on destroy', () => {
    const mockLightingEngine: any = {
      addLight: vi.fn(),
      removeLight: vi.fn(),
    };
    renderer.setLightingEngine(mockLightingEngine);

    renderer.updatePlayers([
      {
        characterId: 'char-1',
        characterName: 'Miner Alice',
        position: { x: 10, y: 5 },
        velocity: { x: 0, y: 0 },
        isMining: false,
        isFacingLeft: false,
        animationState: 'idle',
      },
    ]);

    expect(renderer.getPlayerCount()).toBe(1);
    renderer.destroy();
    expect(renderer.getPlayerCount()).toBe(0);
    expect(mockLightingEngine.removeLight).toHaveBeenCalledWith('remote_flashlight_char-1');
  });
});
