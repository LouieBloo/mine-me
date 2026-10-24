import type { Container } from 'pixi.js';
import type { MiningProfiler } from './MiningProfiler';

/** The part of a Pixi display object this walks. */
interface CountableNode {
  children?: CountableNode[];
  visible?: boolean;
  renderable?: boolean;
}

/** How many display objects are under `root` (itself included), and how many of them can be drawn at all. */
export function countDisplayObjects(root: CountableNode | Container): { total: number; drawable: number } {
  let total = 0;
  let drawable = 0;
  // An explicit stack: the tree holds tens of thousands of nodes, and recursion would be slower and risk overflow
  const stack: { node: CountableNode; hidden: boolean }[] = [{ node: root as CountableNode, hidden: false }];
  while (stack.length > 0) {
    const { node, hidden } = stack.pop()!;
    total++;
    const nowHidden = hidden || node.visible === false || node.renderable === false;
    if (!nowHidden) drawable++; // nothing under a hidden node is drawn
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) stack.push({ node: children[i], hidden: nowHidden });
  }
  return { total, drawable };
}

/** What the scene is made of right now. Any part may be missing (tests, a scene still loading). */
export interface SceneSources {
  stage?: CountableNode | Container | null;
  lights?: { getLightCount(): number } | null;
  particles?: { getActiveParticleCount(): number; getEmitterCount(): number } | null;
  tileSprites?: { size: number } | null;
  tileGraphics?: { size: number } | null;
  renderer?: { resolution?: number; width?: number; height?: number } | null;
  gridCells?: number;
  /** The scenery on screen: doodads drawn, and the lights and particle emitters they keep alive. */
  doodads?: { drawn: number; lights: number; emitters: number } | null;
  /** The conveyor belt's size: segments drawn and items riding it. */
  belt?: { segments: number; items: number } | null;
}

/**
 * Publishes the size of the scene as counters, so a slow frame can be put next to what it was drawing. Walking the
 * tree is not free, so call it about once a second and only while profiling is on.
 */
export function sampleSceneGauges(profiler: MiningProfiler, sources: SceneSources): void {
  if (!profiler.enabled) return;
  if (sources.stage) {
    const { total, drawable } = countDisplayObjects(sources.stage);
    profiler.setGauge('Display objects', total);
    profiler.setGauge('Drawable objects', drawable);
  }
  if (sources.lights) profiler.setGauge('Lights', sources.lights.getLightCount());
  if (sources.particles) {
    profiler.setGauge('Particles', sources.particles.getActiveParticleCount());
    profiler.setGauge('Particle emitters', sources.particles.getEmitterCount());
  }
  if (sources.tileSprites) profiler.setGauge('Tile sprites', sources.tileSprites.size);
  if (sources.tileGraphics) profiler.setGauge('Tile graphics', sources.tileGraphics.size);
  if (sources.doodads) {
    profiler.setGauge('Doodads drawn', sources.doodads.drawn);
    profiler.setGauge('Doodad lights', sources.doodads.lights);
    profiler.setGauge('Doodad emitters', sources.doodads.emitters);
  }
  if (sources.belt) {
    profiler.setGauge('Belt segments', sources.belt.segments);
    profiler.setGauge('Belt items', sources.belt.items);
  }
  if (sources.gridCells !== undefined) profiler.setGauge('Grid cells', sources.gridCells);
  const r = sources.renderer;
  if (r?.width && r?.height) {
    profiler.setGauge('Canvas pixels (millions)', Math.round(((r.width * r.height) / 1e6) * 100) / 100);
    if (r.resolution) profiler.setGauge('Pixel ratio', r.resolution);
  }
}
