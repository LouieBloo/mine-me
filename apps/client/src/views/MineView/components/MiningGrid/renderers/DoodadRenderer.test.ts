import { describe, it, expect } from 'vitest';
import { Container, Graphics, Texture, type Sprite } from 'pixi.js';
import { DoodadField, MiningTileType, type DoodadClientDefinition, type DoodadPartDef } from '@mine-me/shared';
import {
  DOODAD_FADE_SECONDS,
  DOODAD_VIEW_MARGIN_CELLS,
  DoodadRenderer,
  doodadPlaceholderColor,
  drawDoodadPlaceholder,
  type CellRect,
  type DoodadTextureLoader,
} from './DoodadRenderer';
import type { BodySample } from '../systems/DoodadBodies';

const T = 21;
const def = (index: number, anchor: DoodadClientDefinition['anchor'], over: Partial<DoodadClientDefinition> = {}): DoodadClientDefinition => ({
  index, key: `d${index}`, name: `d${index}`, anchor, width: 2, height: 2, zOffset: 0, ...over,
});
const DEFS = [def(0, 'FLOOR'), def(1, 'CEILING'), def(2, 'WALL'), def(3, 'AIR')];
const VIEW: CellRect = { x0: 0, y0: 0, x1: 40, y1: 40 };
const noPictures: DoodadTextureLoader = () => Promise.resolve(null);
const texture = (w: number, h: number) => ({ width: w, height: h }) as unknown as Texture;
const flush = () => new Promise((r) => setTimeout(r, 0));

const make = (placements: ConstructorParameters<typeof DoodadField>[1], defs = DEFS, load: DoodadTextureLoader = noPictures) => {
  const container = new Container();
  const field = new DoodadField(defs, placements);
  const renderer = new DoodadRenderer(container, field, load, T);
  return { container, field, renderer };
};

describe('doodadPlaceholderColor', () => {
  it('is the same for the same key and differs between keys', () => {
    expect(doodadPlaceholderColor('glow_mushroom')).toBe(doodadPlaceholderColor('glow_mushroom'));
    expect(doodadPlaceholderColor('glow_mushroom')).not.toBe(doodadPlaceholderColor('moss'));
    expect(doodadPlaceholderColor('x')).toBeLessThanOrEqual(0xffffff);
  });
});

describe('drawDoodadPlaceholder', () => {
  it.each(['FLOOR', 'CEILING', 'WALL', 'AIR'] as const)('draws something for a %s doodad, and starts over on a redraw', (anchor) => {
    const g = new Graphics();
    drawDoodadPlaceholder(g, { key: 'k', anchor }, 42, 42);
    const bounds = g.getLocalBounds();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    drawDoodadPlaceholder(g, { key: 'k', anchor }, 42, 42);
    expect(g.getLocalBounds().width).toBeCloseTo(bounds.width);
  });

  it('puts the picture on the anchored side: up from the origin for a floor doodad, down for a ceiling one, out from the wall for a wall one', () => {
    const g = (anchor: 'FLOOR' | 'CEILING' | 'WALL') => {
      const gr = new Graphics();
      drawDoodadPlaceholder(gr, { key: 'k', anchor }, 40, 40);
      return gr.getLocalBounds();
    };
    expect(g('FLOOR').maxY).toBeLessThanOrEqual(2);
    expect(g('FLOOR').minY).toBeLessThan(-20);
    expect(g('CEILING').minY).toBeGreaterThanOrEqual(-2); // (an outline sticks out a hair)
    expect(g('CEILING').maxY).toBeGreaterThan(20);
    expect(g('WALL').minX).toBeGreaterThanOrEqual(-2);
    expect(g('WALL').maxX).toBeGreaterThan(10);
  });
});

describe('DoodadRenderer', () => {
  it('draws a sprite per doodad near the camera, standing on its anchor', () => {
    const { container, renderer } = make([[0, 5, 5, 0], [1, 10, 10, 0], [2, 15, 15, 0], [3, 20, 20, 0]]);
    renderer.update(0, VIEW, 0.016);
    expect(renderer.count).toBe(4);
    expect(container.children).toHaveLength(4);
    const byAnchor = (x: number, y: number) => renderer.visible().find((v) => v.entry.x === x && v.entry.y === y)!;
    // Floor doodad (2x2 at 5,5): bottom-centre of the footprint
    expect([byAnchor(5, 5).anchorX, byAnchor(5, 5).anchorY]).toEqual([6 * T, 7 * T]);
    // Ceiling: top-centre
    expect([byAnchor(10, 10).anchorX, byAnchor(10, 10).anchorY]).toEqual([11 * T, 10 * T]);
    // Wall (wall on the left): left edge, middle
    expect([byAnchor(15, 15).anchorX, byAnchor(15, 15).anchorY]).toEqual([15 * T, 16 * T]);
    // Air: the middle
    expect([byAnchor(20, 20).anchorX, byAnchor(20, 20).anchorY]).toEqual([21 * T, 21 * T]);
  });

  it('mirrors a wall doodad whose wall is on the right, onto the right edge', () => {
    const { renderer } = make([[2, 15, 15, 0, 1]]);
    renderer.update(0, VIEW, 0.016);
    const v = renderer.visible()[0];
    expect(v.mirror).toBe(-1);
    expect(v.anchorX).toBe(17 * T);
  });

  it('only gives a sprite to doodads near the camera, and takes it back when they scroll away', () => {
    const { container, renderer } = make([[0, 5, 5, 0], [0, 100, 5, 0]]);
    renderer.update(0, VIEW, 0.016);
    expect(renderer.count).toBe(1);
    // Just outside the view still counts (the margin), well outside does not
    renderer.update(0, { x0: 100 + 2 + DOODAD_VIEW_MARGIN_CELLS, y0: 0, x1: 200, y1: 40 }, 0.016);
    expect(renderer.count).toBe(0); // the one at 100 has only its footprint's margin
    renderer.update(0, { x0: 90, y0: 0, x1: 110, y1: 40 }, 0.016);
    expect(renderer.count).toBe(1);
    expect(container.children.filter((c) => c.visible)).toHaveLength(1);
  });

  it('reuses its sprites (a pool) instead of making new ones as the camera moves', () => {
    const { renderer } = make([[0, 5, 5, 0], [0, 100, 5, 0]]);
    renderer.update(0, VIEW, 0.016);
    const first = (renderer as any).active.values().next().value;
    renderer.update(0, { x0: 90, y0: 0, x1: 110, y1: 40 }, 0.016);
    const second = (renderer as any).active.values().next().value;
    expect(second).toBe(first);
    expect((renderer as any).pool).toHaveLength(0);
  });

  it('does no work when nothing changed: the same camera cell and no doodads coming or going', () => {
    const { field, renderer } = make([[0, 5, 5, 0]]);
    renderer.update(0, VIEW, 0.016);
    let queries = 0;
    const inRect = field.inRect.bind(field);
    field.inRect = (...a) => (queries++, inRect(...a));
    renderer.update(0.1, VIEW, 0.016);
    renderer.update(0.2, VIEW, 0.016);
    expect(queries).toBe(0);
    field.apply([[0, 9, 9, 0]], []);
    renderer.update(0.3, VIEW, 0.016);
    expect(queries).toBe(1);
    expect(renderer.count).toBe(2);
  });

  it('puts a doodad that is set to draw later above the others', () => {
    const { container, renderer } = make([[0, 5, 5, 0], [1, 10, 10, 0]], [def(0, 'FLOOR', { zOffset: 5 }), def(1, 'CEILING', { zOffset: 1 })]);
    renderer.update(0, VIEW, 0.016);
    expect(container.sortableChildren).toBe(true);
    expect(container.children.map((c) => c.zIndex).sort()).toEqual([1, 5]);
  });

  describe('removal', () => {
    it('fades a doodad that loses its block, then gives its sprite back', () => {
      const { field, renderer } = make([[0, 5, 5, 0]]);
      renderer.update(0, VIEW, 0.016);
      const heard: number[] = [];
      renderer.setRemovedListener((info) => heard.push(info.entry.x));
      field.onTileChanged(5, 7, MiningTileType.EMPTY); // the floor under it
      renderer.update(0.1, VIEW, 0); // (the frame that notices the loss runs no time of the fade)
      expect(heard).toEqual([5]);
      expect(renderer.count).toBe(1); // still fading
      expect(renderer.visible()).toHaveLength(0); // ...but no longer a source of light or sound
      renderer.update(0.2, VIEW, DOODAD_FADE_SECONDS / 2);
      const view = (renderer as any).active.values().next().value;
      expect(view.body.alpha).toBeCloseTo(0.5);
      renderer.update(0.3, VIEW, DOODAD_FADE_SECONDS);
      expect(renderer.count).toBe(0);
    });

    it('lets a doodad that was far away go without a fade or a sound', () => {
      const { field, renderer } = make([[0, 100, 5, 0]]);
      const heard: number[] = [];
      renderer.setRemovedListener((info) => heard.push(info.entry.x));
      renderer.update(0, VIEW, 0.016);
      field.onTileChanged(100, 7, MiningTileType.EMPTY);
      renderer.update(0.1, VIEW, 0.016);
      expect(renderer.count).toBe(0);
      expect(heard).toEqual([]);
    });

    it('does not mistake scrolling away for removal', () => {
      const { renderer } = make([[0, 5, 5, 0]]);
      const heard: number[] = [];
      renderer.setRemovedListener((info) => heard.push(info.entry.x));
      renderer.update(0, VIEW, 0.016);
      renderer.update(0.1, { x0: 200, y0: 0, x1: 240, y1: 40 }, 0.016);
      expect(renderer.count).toBe(0);
      expect(heard).toEqual([]);
    });
  });

  describe('pictures', () => {
    it('shows the placeholder first, then the picture once it has loaded, fitted to the footprint', async () => {
      const { renderer } = make([[0, 5, 5, 0]], [def(0, 'FLOOR', { textureUrl: '/assets/mushroom.png' })], () => Promise.resolve(texture(64, 64)));
      renderer.update(0, VIEW, 0.016);
      const view = (renderer as any).active.values().next().value;
      expect(view.placeholder.visible).toBe(true);
      await flush();
      expect(view.placeholder.visible).toBe(false);
      const sprite = view.art as Sprite;
      expect(sprite).toBeTruthy();
      expect([sprite.anchor.x, sprite.anchor.y]).toEqual([0.5, 1]);
      expect(sprite.width).toBeCloseTo(2 * T);
      expect(sprite.height).toBeCloseTo(2 * T);
    });

    it('keeps the placeholder when the picture will not load', async () => {
      const { renderer } = make([[0, 5, 5, 0]], [def(0, 'FLOOR', { textureUrl: '/assets/missing.png' })]);
      renderer.update(0, VIEW, 0.016);
      await flush();
      const view = (renderer as any).active.values().next().value;
      expect(view.placeholder.visible).toBe(true);
      expect(view.art).toBeNull();
    });

    it('uses the picture of the size it took, when that size has one', async () => {
      const asked: string[] = [];
      const defs = [def(0, 'FLOOR', { textureUrl: '/assets/a.png', sizeVariants: [{ width: 2, height: 2, weight: 1 }, { width: 3, height: 3, weight: 1, textureUrl: '/assets/big.png' }] })];
      const { renderer } = make([[0, 5, 5, 1]], defs, (url) => (asked.push(url), Promise.resolve(texture(10, 10))));
      renderer.update(0, VIEW, 0.016);
      await flush();
      expect(asked).toEqual(['/assets/big.png']);
    });

    it('ignores a picture that arrives after the sprite went to another doodad', async () => {
      let resolveLoad!: (t: Texture) => void;
      const { renderer } = make([[0, 5, 5, 0], [0, 100, 5, 0]], [def(0, 'FLOOR', { textureUrl: '/assets/a.png' })], () => new Promise((r) => (resolveLoad = r)));
      renderer.update(0, VIEW, 0.016);
      renderer.update(0, { x0: 90, y0: 0, x1: 110, y1: 40 }, 0.016); // the first sprite is reused for the doodad at 100
      resolveLoad(texture(64, 64));
      await flush();
      const views = [...(renderer as any).active.values()];
      expect(views).toHaveLength(1);
      expect(views[0].entry.x).toBe(100);
      expect(views[0].art?.parent).toBe(views[0].body); // exactly one picture, on the right doodad
    });

    it('builds a doodad in parts, each at its place, once all the pictures are in', async () => {
      const parts: DoodadPartDef[] = [
        { name: 'stem', file: '/assets/stem.png', width: 10, height: 20, pivot_anchor: [5, 20], offset_from_anchor: [0, 0], z_index: 0 },
        { name: 'cap', file: '/assets/cap.png', width: 30, height: 12, pivot_anchor: [15, 12], offset_from_anchor: [0, -18], z_index: 1 },
      ];
      const { renderer } = make([[0, 5, 5, 0]], [def(0, 'FLOOR', { parts, motion: { preset: 'sway', amplitude: 0.1, speed: 1, params: { weight_stem: 0 } } })], () => Promise.resolve(texture(10, 10)));
      renderer.update(0, VIEW, 0.016);
      await flush();
      const view = (renderer as any).active.values().next().value;
      expect(view.partSprites).toHaveLength(2);
      expect(view.placeholder.visible).toBe(false);
      renderer.update(0.2, VIEW, 0.016);
      const [stem, cap] = view.partSprites;
      expect(stem.sprite.rotation).toBe(0); // planted
      expect(cap.sprite.rotation).not.toBe(0); // swaying
      expect(cap.sprite.y).toBeLessThan(stem.sprite.y); // above it
    });
  });

  describe('motion', () => {
    it('poses a doodad by the time, and each one out of step with its neighbours', () => {
      const defs = [def(0, 'FLOOR', { motion: { preset: 'sway', speed: 1, amplitude: 0.2 } })];
      const { renderer } = make([[0, 5, 5, 0], [0, 12, 5, 0]], defs);
      renderer.update(0.3, VIEW, 0.016);
      const rotations = [...(renderer as any).active.values()].map((v: any) => v.body.rotation);
      expect(rotations[0]).not.toBe(rotations[1]);
      renderer.update(0.3, VIEW, 0.016);
      expect([...(renderer as any).active.values()].map((v: any) => v.body.rotation)).toEqual(rotations);
    });

    it('stands still without a motion', () => {
      const { renderer } = make([[0, 5, 5, 0]]);
      renderer.update(1.7, VIEW, 0.016);
      const view = (renderer as any).active.values().next().value;
      expect(view.body.rotation).toBe(0);
      expect(view.body.alpha).toBe(1);
    });

    it('draws the falling drop of a placeholder drip, and hides it while the drop forms', () => {
      const defs = [def(1, 'CEILING', { motion: { preset: 'drip', speed: 1, phase: 0 } })];
      const { renderer } = make([[0, 5, 5, 0]], defs.map((d) => ({ ...d, index: 0 })));
      renderer.update(0.2, VIEW, 0.016);
      const view = (renderer as any).active.values().next().value;
      expect(view.drop.visible).toBe(false);
      renderer.update(0.8, VIEW, 0.016);
      expect(view.drop.visible).toBe(true);
      const early = view.drop.y;
      renderer.update(0.95, VIEW, 0.016);
      expect(view.drop.y).toBeGreaterThan(early);
    });
  });

  it('destroys everything with the renderer', () => {
    const { container, renderer } = make([[0, 5, 5, 0]]);
    renderer.update(0, VIEW, 0.016);
    renderer.destroy();
    expect(renderer.count).toBe(0);
    expect(container.children).toHaveLength(0);
    renderer.update(1, VIEW, 0.016); // harmless after destroy
  });
});

describe('DoodadRenderer reacting to bodies (ticket 104)', () => {
  const reactive = [def(0, 'FLOOR', { reacts: { strength: 1, radius: 3 } })];
  // The floor doodad at (5,5) is 2x2, so its base is at cell (6, 7)
  const walker = (x: number, vx?: number): BodySample => ({ id: 'self', x, y: 6.5, vx, vy: vx === undefined ? undefined : 0 });
  const rotationOf = (renderer: DoodadRenderer): number => (renderer as any).active.values().next().value.body.rotation;

  it('leans the way a body walks past, then straightens up by itself', () => {
    const { renderer } = make([[0, 5, 5, 0]], reactive);
    for (let i = 0; i < 20; i++) renderer.update(i / 60, VIEW, 1 / 60, [walker(5.5, 4)]);
    expect(rotationOf(renderer)).toBeGreaterThan(0.05);
    for (let i = 0; i < 400; i++) renderer.update(2 + i / 60, VIEW, 1 / 60, []);
    expect(rotationOf(renderer)).toBe(0);
  });

  it('leans the other way for a body going left', () => {
    const { renderer } = make([[0, 5, 5, 0]], reactive);
    for (let i = 0; i < 20; i++) renderer.update(i / 60, VIEW, 1 / 60, [walker(7.5, -4)]);
    expect(rotationOf(renderer)).toBeLessThan(-0.05);
  });

  it('works out the speed of a remote player or a mob that reports only where it is', () => {
    const { renderer } = make([[0, 5, 5, 0]], reactive);
    for (let i = 0; i < 30; i++) renderer.update(i / 60, VIEW, 1 / 60, [{ id: 'mob:1', x: 3 + i * (4 / 60), y: 6.5 }]);
    expect(rotationOf(renderer)).toBeGreaterThan(0.05);
  });

  it('leaves a doodad alone when a body is far, or standing still next to it', () => {
    const { renderer } = make([[0, 5, 5, 0]], reactive);
    for (let i = 0; i < 30; i++) renderer.update(i / 60, VIEW, 1 / 60, [walker(30, 4), { id: 'other', x: 6, y: 6.5, vx: 0, vy: 0 }]);
    expect(rotationOf(renderer)).toBe(0);
  });

  it('adds the lean to what the motion preset does', () => {
    const { renderer } = make([[0, 5, 5, 0]], [def(0, 'FLOOR', { reacts: { strength: 1, radius: 3 }, motion: { preset: 'sway', speed: 1, amplitude: 0.1, phase: 0 } })]);
    renderer.update(0, VIEW, 1 / 60, []);
    const swayOnly = rotationOf(renderer);
    for (let i = 0; i < 20; i++) renderer.update(0, VIEW, 1 / 60, [walker(5.5, 4)]);
    expect(rotationOf(renderer)).toBeGreaterThan(swayOnly + 0.05);
  });

  it('puffs spores once when a body comes by, and says so to the listener', () => {
    const { renderer } = make([[0, 5, 5, 0]], [def(0, 'FLOOR', { reacts: { strength: 1, radius: 3, puffEffectId: 'spores' } })]);
    const puffs: string[] = [];
    renderer.setPuffListener((info, id) => puffs.push(`${info.entry.x}:${id}`));
    for (let i = 0; i < 30; i++) renderer.update(i / 60, VIEW, 1 / 60, [walker(5.5, 3)]);
    expect(puffs).toEqual(['5:spores']);
  });

  it('asks for bodies only while something on screen reacts or wanders', () => {
    const plain = make([[0, 5, 5, 0]]);
    plain.renderer.update(0, VIEW, 1 / 60);
    expect(plain.renderer.needsBodies).toBe(false);
    const withReaction = make([[0, 5, 5, 0]], reactive);
    withReaction.renderer.update(0, VIEW, 1 / 60);
    expect(withReaction.renderer.needsBodies).toBe(true);
    // ...and a doodad that scrolled away stops counting
    withReaction.renderer.update(0, { x0: 200, y0: 0, x1: 240, y1: 40 }, 1 / 60);
    expect(withReaction.renderer.needsBodies).toBe(false);
  });
});

describe('DoodadRenderer wandering (ticket 106)', () => {
  // A cave: floor on row 6 (solid), open above; the bug is a 1x1 floor doodad standing at (10, 5)
  const terrain = { isSolid: (x: number, y: number) => y >= 6 || y < 0 || x < 0 || x > 40 };
  const bug = [def(0, 'FLOOR', { width: 1, height: 1, wander: { mode: 'CRAWL', radius: 4, speed: 2, pauseMs: 300 } })];
  const place = () => {
    const made = make([[0, 10, 5, 0]], bug);
    made.renderer.setTerrain(terrain);
    return made;
  };
  const spot = (renderer: DoodadRenderer) => ({ x: renderer.visible()[0].anchorX / T, y: renderer.visible()[0].anchorY / T });

  it('walks along its surface, within its radius', () => {
    const { renderer } = place();
    renderer.update(0, VIEW, 1 / 30, []);
    const home = spot(renderer);
    let farthest = 0;
    for (let i = 1; i <= 900; i++) {
      renderer.update(i / 30, VIEW, 1 / 30, []);
      const now = spot(renderer);
      expect(now.y).toBeCloseTo(home.y); // never leaves the floor
      farthest = Math.max(farthest, Math.abs(now.x - home.x));
    }
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThanOrEqual(4 + 1e-6);
  });

  it('stays where it was placed without terrain to walk on', () => {
    const { renderer } = make([[0, 10, 5, 0]], bug);
    const x0 = (renderer.update(0, VIEW, 1 / 30, []), spot(renderer).x);
    for (let i = 1; i <= 300; i++) renderer.update(i / 30, VIEW, 1 / 30, []);
    expect(spot(renderer).x).toBe(x0);
  });

  it('is scared by a body that comes near and runs from it', () => {
    const { renderer } = place();
    renderer.update(0, VIEW, 1 / 30, []);
    const home = spot(renderer).x;
    // A body running in from the left, at the bug's feet
    for (let i = 1; i <= 15; i++) renderer.update(i / 30, VIEW, 1 / 30, [{ id: 'self', x: 8 + i * 0.1, y: 5.5, vx: 3, vy: 0 }]);
    expect(spot(renderer).x).toBeGreaterThan(home + 0.5);
  });

  it('carries its light and particles along with it', () => {
    const { renderer } = place();
    renderer.update(0, VIEW, 1 / 30, []);
    const first = renderer.visible()[0].anchorX;
    for (let i = 1; i <= 400; i++) renderer.update(i / 30, VIEW, 1 / 30, []);
    // The effects read the view's current spot, so it is not the placed one any more
    expect(renderer.visible()[0].anchorX).not.toBe(first);
  });

  it('turns to face the way it goes', () => {
    const { renderer } = place();
    const seen = new Set<number>();
    for (let i = 0; i <= 1500; i++) {
      renderer.update(i / 30, VIEW, 1 / 30, []);
      seen.add(Math.sign((renderer as any).active.values().next().value.body.scale.x));
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });
});

