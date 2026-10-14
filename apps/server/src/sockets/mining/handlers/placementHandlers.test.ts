import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findFirst = vi.fn();
vi.mock('../../../index', () => ({ prisma: { inventoryItem: { findFirst: (...args: unknown[]) => findFirst(...args) } } }));
const consume = vi.fn();
const refund = vi.fn();
vi.mock('./inventoryActions', () => ({
  inventoryActionsFor: () => ({
    broadcast: vi.fn(),
    consume: (...args: unknown[]) => consume(...args),
    refund: (...args: unknown[]) => refund(...args),
  }),
}));

import { handleMiningPlaceTorch } from './placementHandlers';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';

describe('handleMiningPlaceTorch', () => {
  const socket = { data: { characterId: 'torch-char' } } as any;
  const engine = { rules: { persistsCharacter: true }, canPlaceTorch: vi.fn(() => true), placeTorch: vi.fn(() => true) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(miningSessionManager, 'getSession').mockReturnValue(engine as any);
    findFirst.mockResolvedValue({ id: 'inv-1', itemId: 'item-torch', item: { id: 'item-torch' } });
    consume.mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('places the torch with the item it used, so the torch lights oil by that item\'s Ignites effect', async () => {
    const res = await handleMiningPlaceTorch({} as any, socket, { target: { x: 4, y: 5 } });
    expect(res.success).toBe(true);
    expect(engine.placeTorch).toHaveBeenCalledWith('torch-char', { x: 4, y: 5 }, 'item-torch');
  });

  it('refunds the torch if the placement is refused after it was taken', async () => {
    engine.placeTorch.mockReturnValueOnce(false);
    const res = await handleMiningPlaceTorch({} as any, socket, { target: { x: 4, y: 5 } });
    expect(res.success).toBe(false);
    expect(refund).toHaveBeenCalledWith('torch-char', 'item-torch');
  });

  it('says so when the player has no torch', async () => {
    findFirst.mockResolvedValue(null);
    const res = await handleMiningPlaceTorch({} as any, socket, { target: { x: 4, y: 5 } });
    expect(res).toEqual({ success: false, error: 'You do not have a torch to place.' });
    expect(engine.placeTorch).not.toHaveBeenCalled();
  });
});
