import { describe, it, expect, vi } from 'vitest';
import { applyTickEntityLists } from './applyTickEntityLists';

const mob = { id: 'm1' } as any;
const player = { characterId: 'p1' } as any;

const make = () => ({
  mobRenderer: { updateMobs: vi.fn() },
  remotePlayerRenderer: { updatePlayers: vi.fn() },
});

describe('applyTickEntityLists', () => {
  it('passes non-empty lists through', () => {
    const r = make();
    applyTickEntityLists({ mobs: [mob], otherPlayers: [player] }, r);
    expect(r.mobRenderer.updateMobs).toHaveBeenCalledWith([mob]);
    expect(r.remotePlayerRenderer.updatePlayers).toHaveBeenCalledWith([player]);
  });

  it('treats an empty array as authoritative so the last mob/player is removed', () => {
    const r = make();
    applyTickEntityLists({ mobs: [], otherPlayers: [] }, r);
    expect(r.mobRenderer.updateMobs).toHaveBeenCalledWith([]);
    expect(r.remotePlayerRenderer.updatePlayers).toHaveBeenCalledWith([]);
  });

  it('leaves entities alone when the fields are missing', () => {
    const r = make();
    applyTickEntityLists({}, r);
    expect(r.mobRenderer.updateMobs).not.toHaveBeenCalled();
    expect(r.remotePlayerRenderer.updatePlayers).not.toHaveBeenCalled();
  });

  it('tolerates missing renderers', () => {
    expect(() => applyTickEntityLists({ mobs: [], otherPlayers: [] }, {})).not.toThrow();
    expect(() => applyTickEntityLists({ mobs: [mob] }, { mobRenderer: null })).not.toThrow();
  });
});
