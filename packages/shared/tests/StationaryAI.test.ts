import { describe, it, expect } from 'vitest';
import { MobAIRegistry } from '../src/gameLogic/ai/MobAIRegistry';
import { StationaryAI } from '../src/gameLogic/ai/StationaryAI';
import type { MobAIContext } from '../src/gameLogic/ai/BaseMobAI';

describe('StationaryAI', () => {
  it('registers in MobAIRegistry for STATIONARY key', () => {
    const aiStationary = MobAIRegistry.create('STATIONARY', 'dummy_1', 'inst_1');
    expect(aiStationary).toBeInstanceOf(StationaryAI);
  });

  it('produces idle and zero movement intent on update', () => {
    const ai = new StationaryAI('dummy_1', 'inst_1');
    const mockContext: MobAIContext = {
      mobId: 'dummy_1',
      instanceId: 'inst_1',
      position: { x: 25, y: 0 },
      velocity: { x: 0, y: 0 },
      health: 1000000,
      maxHealth: 1000000,
      defense: 0,
      isGrounded: true,
      isOnLadder: false,
      grid: {},
      players: [
        {
          characterId: 'p1',
          position: { x: 22, y: 0 },
          health: 100,
        },
      ],
    };

    const intent = ai.update(0.016, mockContext);
    expect(intent.moveX).toBe(0);
    expect(intent.jump).toBe(false);
    expect(intent.climbUp).toBe(false);
    expect(intent.climbDown).toBe(false);
    expect(intent.isMining).toBe(false);
    expect(intent.miningTarget).toBeNull();
    expect(intent.isAttacking).toBe(false);
    expect(intent.animationState).toBe('idle');
  });
});
