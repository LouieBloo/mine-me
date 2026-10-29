import type { SurfaceLayerShape } from '../../types/surface';
import { hash01 } from '../weather/weather';

/**
 * The outline of a scenery layer that has no picture: far mountains, rolling hills, a treeline. Every outline repeats
 * exactly after its period (its harmonics are whole waves across it), so it tiles with no seam.
 */

/** Heights (0 to 1 of the layer's height) at `samples` evenly spaced points across one period. */
export function silhouetteHeights(shape: SurfaceLayerShape, seed: number, samples: number): number[] {
  const n = Math.max(2, Math.floor(samples));
  if (shape === 'flat') return new Array<number>(n).fill(1);
  // [whole waves across the period, amplitude] per harmonic
  const harmonics: [number, number][] =
    shape === 'mountains' ? [[2, 0.5], [5, 0.3], [11, 0.15], [23, 0.05]]
    : shape === 'hills' ? [[1, 0.55], [3, 0.3], [6, 0.15]]
    : [[17, 0.4], [31, 0.35], [53, 0.25]];
  const phases = harmonics.map((_, i) => hash01(seed, i, 41) * Math.PI * 2);
  const raw = Array.from({ length: n }, (_, i) => {
    const x = i / n;
    let h = 0;
    harmonics.forEach(([waves, amp], k) => {
      const wave = Math.sin(2 * Math.PI * waves * x + phases[k]);
      // Peaks are sharp on mountains (ridged), round on hills, spiky on a treeline
      h += amp * (shape === 'mountains' ? 1 - Math.abs(wave) * 1 : shape === 'treeline' ? Math.abs(wave) : wave * 0.5 + 0.5);
    });
    return h;
  });
  const low = Math.min(...raw);
  const high = Math.max(...raw);
  const span = high - low || 1;
  // Never lower than a fifth of the height, so the layer always has a body to stand on
  return raw.map((h) => 0.2 + 0.8 * ((h - low) / span));
}
