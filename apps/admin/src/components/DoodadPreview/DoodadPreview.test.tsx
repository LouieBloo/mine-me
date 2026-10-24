import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { DoodadDefinition } from '@mine-me/shared';

// Pixi and the particle engine need a GPU; the overlay's wiring is what is tested here
const engine = vi.hoisted(() => ({
  addEmitter: vi.fn(() => ({ setPosition: vi.fn(), destroy: vi.fn() })),
  spawnBurst: vi.fn(),
  update: vi.fn(),
  destroy: vi.fn(),
  tick: null as null | ((t: { deltaMS: number }) => void),
}));
vi.mock('pixi.js', () => ({
  Application: class {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn() };
    renderer = {};
    ticker = { add: (fn: (t: { deltaMS: number }) => void) => { engine.tick = fn; } };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  },
  Container: class {},
}));
vi.mock('../ParticleCanvas/ParticleEngine', () => ({
  ParticleEngine: class {
    addEmitter = engine.addEmitter;
    spawnBurst = engine.spawnBurst;
    update = engine.update;
    destroy = engine.destroy;
  },
}));

import DoodadPreview from './DoodadPreview';

const doodad = (over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({
  id: 'd', key: 'moss', name: 'Moss', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, biomes: [], ...over,
});

/** A recording 2D context, handed out for every canvas. */
const calls: Array<[string, unknown[]]> = [];
const ctx = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' } as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    if (prop === 'createRadialGradient') return () => ({ addColorStop: vi.fn() });
    return (...args: unknown[]) => calls.push([prop, args]);
  },
  set(target, prop: string, value) {
    target[prop] = value;
    return true;
  },
});

let frameQueue: Array<((t: number) => void) | null> = [];
let clock = 0;
/** Runs `n` animation frames, 16 ms apart. */
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) {
    clock += 16;
    const queued = frameQueue;
    frameQueue = [];
    await act(async () => queued.forEach((cb) => cb?.(clock)));
  }
};
const callsOf = (op: string) => calls.filter(([o]) => o === op);

beforeEach(() => {
  calls.length = 0;
  frameQueue = [];
  clock = 0;
  engine.addEmitter.mockClear();
  engine.spawnBurst.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as any);
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frameQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frameQueue[id - 1] = null; });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderIt = (d: DoodadDefinition = doodad(), props: Partial<React.ComponentProps<typeof DoodadPreview>> = {}) => {
  const onChange = vi.fn();
  const view = render(<DoodadPreview doodad={d} onChange={onChange} {...props} />);
  return { onChange, ...view };
};

describe('DoodadPreview', () => {
  it('draws the scene and the doodad every frame, a placeholder while there is no picture', async () => {
    renderIt();
    await frames(2);
    expect(screen.getByLabelText('Doodad preview scene')).toBeInTheDocument();
    expect(callsOf('fillRect').length).toBeGreaterThan(10); // background + the floor blocks
    expect(callsOf('drawImage')).toHaveLength(0);
    expect(callsOf('ellipse').length).toBeGreaterThan(0); // the mushroom placeholder
  });

  it('draws the doodad\'s picture once it has loaded', async () => {
    class FakeImage {
      naturalWidth = 20;
      naturalHeight = 40;
      onload: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    renderIt(doodad({ textureUrl: '/assets/sprites/doodads/moss.png' }));
    await frames(1);
    await act(async () => { await Promise.resolve(); });
    await frames(2);
    expect(callsOf('drawImage').length).toBeGreaterThan(0);
  });

  it('pauses and plays', async () => {
    renderIt(doodad({ motion: { preset: 'sway' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await frames(3);
    const rotations = callsOf('rotate').map(([, args]) => args[0]);
    expect(new Set(rotations).size).toBe(1); // time is not moving
  });

  it('moves the doodad with its motion preset while playing', async () => {
    renderIt(doodad({ motion: { preset: 'sway' } }));
    await frames(30);
    const rotations = new Set(callsOf('rotate').map(([, args]) => (args[0] as number).toFixed(4)));
    expect(rotations.size).toBeGreaterThan(5);
  });

  it('tells how long one loop of the motion takes', () => {
    renderIt(doodad({ motion: { preset: 'sway', speed: 0.5 } }));
    expect(screen.getByTestId('preview-loop')).toHaveTextContent('2.0 s');
    renderIt(doodad());
    expect(screen.getAllByTestId('preview-loop')[1]).toHaveTextContent('still');
  });

  it('offers the wall side only for a wall doodad, and a size choice only for several sizes', () => {
    const { unmount } = renderIt(doodad({ anchor: 'WALL' }));
    expect(screen.getByRole('button', { name: 'Wall on the left' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wall on the left' }));
    expect(screen.getByRole('button', { name: 'Wall on the right' })).toBeInTheDocument();
    unmount();
    renderIt(doodad());
    expect(screen.queryByRole('button', { name: /Wall on the/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Size shown')).not.toBeInTheDocument();
  });

  it('shows another size when picked', () => {
    renderIt(doodad({ sizeVariants: [{ width: 3, height: 3, weight: 1 }, { width: 6, height: 9, weight: 1 }] }));
    fireEvent.change(screen.getByLabelText('Size shown'), { target: { value: '1' } });
    expect(screen.getByText('6 x 9', { selector: 'dd' })).toBeInTheDocument();
  });

  it('hides and shows the markers', async () => {
    renderIt(doodad({ particleEffectId: 'p1' }));
    await frames(1);
    const withMarkers = callsOf('arc').length;
    expect(withMarkers).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Hide markers' }));
    calls.length = 0;
    await frames(1);
    expect(callsOf('arc')).toHaveLength(0);
  });

  describe('the wiggle test', () => {
    const reacting = () => doodad({ reacts: { strength: 1, radius: 6, puffEffectId: 'puff' } });

    it('does not draw the dummy for a doodad that neither reacts nor wanders', async () => {
      renderIt(doodad());
      await frames(2);
      expect(screen.getByText(/Turn on "Reacts to bodies"/)).toBeInTheDocument();
    });

    it('leans the doodad and counts a spore puff when the dummy is swept past it', async () => {
      renderIt(reacting(), { puffConfig: { emitterType: 'burst' } as any });
      fireEvent.click(screen.getByRole('button', { name: 'Sweep dummy past' }));
      expect(screen.getByRole('button', { name: 'Stop sweep' })).toHaveAttribute('aria-pressed', 'true');
      await frames(240);
      const leans = callsOf('rotate').map(([, args]) => Math.abs(args[0] as number));
      expect(Math.max(...leans)).toBeGreaterThan(0.05);
      expect(Number(screen.getByTestId('preview-puffs').textContent)).toBeGreaterThan(0);
      expect(engine.spawnBurst).not.toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('stays upright when nobody goes near it', async () => {
      renderIt(reacting());
      await frames(60);
      const leans = callsOf('rotate').map(([, args]) => Math.abs(args[0] as number));
      expect(Math.max(...leans)).toBe(0);
    });

    it('lets the dummy be dragged: the doodad leans while it moves and settles after', async () => {
      renderIt(reacting());
      const stage = screen.getByTestId('doodad-preview-stage');
      stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 512, height: 384, right: 512, bottom: 384, x: 0, y: 0, toJSON: () => ({}) });
      // The doodad's base is in the middle of the scene, 3 cells above the bottom
      fireEvent.pointerDown(stage, { clientX: 140, clientY: 270, pointerId: 1 });
      await frames(1);
      for (let x = 150; x <= 260; x += 10) {
        fireEvent.pointerMove(stage, { clientX: x, clientY: 270, pointerId: 1 });
        await frames(1);
      }
      expect(Math.max(...callsOf('rotate').map(([, args]) => Math.abs(args[0] as number)))).toBeGreaterThan(0.01);
      fireEvent.pointerUp(stage, { pointerId: 1 });
      await frames(120);
      calls.length = 0;
      await frames(1);
      expect(Math.abs(callsOf('rotate')[0][1][0] as number)).toBeLessThan(0.01);
    });
  });

  describe('a bug', () => {
    it('is drawn carried off its spot as it wanders', async () => {
      renderIt(doodad({ wander: { mode: 'CRAWL', radius: 6, speed: 4, pauseMs: 0 } }));
      await frames(200);
      const xs = new Set(callsOf('translate').map(([, args]) => Math.round(args[0] as number)));
      expect(xs.size).toBeGreaterThan(3);
    });
  });

  describe('the effects', () => {
    it('plays a continuous particle effect from an emitter that follows the doodad', async () => {
      renderIt(doodad({ particleEffectId: 'p1' }), { particleConfig: { emitterType: 'continuous' } as any, particleName: 'Spores' });
      await act(async () => { await Promise.resolve(); });
      expect(engine.addEmitter).toHaveBeenCalledWith(expect.objectContaining({ emitterType: 'continuous' }), expect.objectContaining({ x: expect.any(Number) }));
    });

    it('repeats a burst effect so it can be seen', async () => {
      renderIt(doodad({ particleEffectId: 'p1' }), { particleConfig: { emitterType: 'burst' } as any });
      await act(async () => { await Promise.resolve(); });
      act(() => engine.tick?.({ deltaMS: 1600 }));
      expect(engine.spawnBurst).toHaveBeenCalledTimes(1);
    });

    it('draws a glow for a light', async () => {
      renderIt(doodad({ light: { enabled: true, type: 'POINT', effect: 'STATIC', color: '#38bdf8', radius: 6, intensity: 0.6 } }));
      await frames(2);
      expect(callsOf('fillRect').some(([, args]) => (args as number[])[2] > 100 && (args as number[])[2] < 400)).toBe(true);
    });
  });

  describe('the origin cards', () => {
    it('moves the particle origin', () => {
      const { onChange } = renderIt(doodad({ particleEffectId: 'p1', particleOffsetX: 3, particleOffsetY: 4 }), { particleConfig: { emitterType: 'burst' } as any });
      fireEvent.change(screen.getByLabelText('Particle Horizontal Offset (X)', { selector: 'input[type="number"]' }), { target: { value: '12' } });
      expect(onChange).toHaveBeenLastCalledWith({ particleOffsetX: 12 });
    });

    it('moves the light origin without changing the rest of the light', () => {
      const light = { enabled: true, type: 'POINT', effect: 'STATIC', color: '#38bdf8', radius: 6, intensity: 0.6, offsetX: 2, offsetY: -3 } as const;
      const { onChange } = renderIt(doodad({ light }));
      fireEvent.change(screen.getByLabelText('Light Vertical Offset (Y)', { selector: 'input[type="number"]' }), { target: { value: '-9' } });
      expect(onChange).toHaveBeenLastCalledWith({ light: { ...light, offsetX: 2, offsetY: -9 } });
    });

    it('shows no origin card for an effect the doodad does not have', () => {
      renderIt(doodad());
      expect(screen.queryByTestId('doodad-particle-origin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('doodad-light-origin')).not.toBeInTheDocument();
    });
  });

  describe('the sound test', () => {
    it('plays the ambient sound at its volume and stops it', async () => {
      const play = vi.fn().mockResolvedValue(undefined);
      const pause = vi.fn();
      const made: any[] = [];
      vi.stubGlobal('Audio', class {
        volume = 1;
        loop = false;
        onended: (() => void) | null = null;
        play = play;
        pause = pause;
        src: string;
        constructor(src: string) { this.src = src; made.push(this); }
      });
      renderIt(doodad(), { ambientSound: { url: '/assets/sounds/drip.mp3', volume: 0.4, loop: true } });
      fireEvent.click(screen.getByRole('button', { name: 'Play ambient sound' }));
      expect(play).toHaveBeenCalled();
      expect(made[0].volume).toBe(0.4);
      expect(made[0].loop).toBe(true);
      expect(made[0].src).toContain('/assets/sounds/drip.mp3');
      fireEvent.click(screen.getByRole('button', { name: 'Stop sound' }));
      expect(pause).toHaveBeenCalled();
    });

    it('has no sound button for a doodad without an ambient sound', () => {
      renderIt(doodad());
      expect(screen.queryByRole('button', { name: /sound/i })).not.toBeInTheDocument();
    });
  });
});
