import { describe, it, expect } from 'vitest';
import { BACKGROUND_COLOR, BLOCK_COLOR, drawDrop, drawLight, drawMarker, drawPiece, drawPlaceholder, drawScene, type PreviewContext } from './drawDoodadPreview';
import { PREVIEW_TILE, buildPreviewScene, placeholderColor, type PreviewPiece } from './doodadPreviewScene';

/** A stand-in context that records what is drawn and with what style. */
function recorder() {
  const calls: Array<{ op: string; args: unknown[]; fill?: unknown; alpha?: number }> = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, fill: state.fillStyle, alpha: state.globalAlpha as number });
  };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createRadialGradient') return (...args: unknown[]) => { calls.push({ op: prop, args }); return { addColorStop: record('addColorStop') }; };
      return record(prop);
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as PreviewContext;
  return { ctx, calls, ops: () => calls.map((c) => c.op) };
}

const piece = (over: Partial<PreviewPiece> = {}): PreviewPiece => ({
  name: null, url: null, x: 100, y: 200, pivotX: 0.5, pivotY: 1, width: 96, height: 96, rotation: 0.2, scaleX: -1, scaleY: 1, alpha: 0.8, zIndex: 0, ...over,
});

describe('drawScene', () => {
  it('paints the background and a block for every solid cell', () => {
    const scene = buildPreviewScene('FLOOR', 3, 3);
    const { ctx, calls } = recorder();
    drawScene(ctx, scene);
    expect(calls.find((c) => c.op === 'fillRect')!.fill).toBe(BACKGROUND_COLOR);
    const blocks = calls.filter((c) => c.op === 'fillRect' && c.fill === BLOCK_COLOR);
    let solid = 0;
    for (let y = 0; y < scene.rows; y++) for (let x = 0; x < scene.cols; x++) if (scene.isSolid(x, y)) solid++;
    expect(blocks).toHaveLength(solid);
    expect(blocks[0].args).toEqual([expect.any(Number), expect.any(Number), PREVIEW_TILE, PREVIEW_TILE]);
  });
});

describe('drawPiece', () => {
  it('moves to the pivot, turns and mirrors, then draws the loaded picture hanging off the pivot', () => {
    const { ctx, calls, ops } = recorder();
    const image = {} as CanvasImageSource;
    drawPiece(ctx, piece({ url: '/assets/a.png' }), image, 'FLOOR', 'moss');
    expect(ops()).toEqual(['save', 'translate', 'rotate', 'scale', 'drawImage', 'restore']);
    expect(calls[1].args).toEqual([100, 200]);
    expect(calls[2].args).toEqual([0.2]);
    expect(calls[3].args).toEqual([-1, 1]);
    expect(calls[4].args).toEqual([image, -48, -96, 96, 96]);
    expect(calls[4].alpha).toBe(0.8);
  });

  it('draws the placeholder when the picture is not there', () => {
    const { ctx, ops } = recorder();
    drawPiece(ctx, piece({ url: null }), null, 'FLOOR', 'moss');
    expect(ops()).not.toContain('drawImage');
    expect(ops()).toContain('fill');
  });
});

describe('drawPlaceholder', () => {
  it('draws a different shape for each anchor, in the colour of the key', () => {
    const shapes = (['FLOOR', 'CEILING', 'WALL', 'AIR'] as const).map((anchor) => {
      const { ctx, calls, ops } = recorder();
      drawPlaceholder(ctx, anchor, 'moss', 96, 96);
      expect(calls.find((c) => c.op === 'fill')!.fill).toBe(placeholderColor('moss'));
      return ops().join(',');
    });
    expect(new Set(shapes).size).toBe(4);
  });
});

describe('drawLight', () => {
  it('adds a glow of the light\'s colour around the point, scaled by its strength', () => {
    const { ctx, calls, ops } = recorder();
    drawLight(ctx, { color: '#38bdf8', radius: 100, strength: 0.5 }, { x: 50, y: 60 });
    expect(ops()).toContain('createRadialGradient');
    expect(calls.find((c) => c.op === 'createRadialGradient')!.args).toEqual([50, 60, 0, 50, 60, 100]);
    expect(calls.find((c) => c.op === 'fillRect')!.alpha).toBeCloseTo(0.35);
  });

  it('draws nothing for a light that is off at this moment', () => {
    const { ctx, calls } = recorder();
    drawLight(ctx, { color: '#fff', radius: 100, strength: 0 }, { x: 0, y: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe('drawDrop and drawMarker', () => {
  it('fades the drop out as it falls', () => {
    const { ctx, calls } = recorder();
    drawDrop(ctx, { x: 10, y: 20, alpha: 0.5 });
    expect(calls.find((c) => c.op === 'ellipse')!.alpha).toBeCloseTo(0.45);
  });

  it('marks a place with a ring or a cross in the given colour', () => {
    const ring = recorder();
    drawMarker(ring.ctx, { x: 5, y: 5 }, '#f59e0b');
    expect(ring.ops()).toContain('arc');
    const cross = recorder();
    drawMarker(cross.ctx, { x: 5, y: 5 }, '#fff', 'cross');
    expect(cross.ops()).not.toContain('arc');
    expect(cross.ops().filter((o) => o === 'lineTo')).toHaveLength(2);
  });
});
