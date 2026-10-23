import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { MINING_SPATIAL_AUDIO_PRESETS, landingHeightFraction, landingProgress, type MiningExtractorClientState, type ParticleEffectConfig } from '@mine-me/shared';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import { TILE_SIZE } from './MiningTileRenderer';

/** How far above its landing spot the machine starts, in cells. */
export const LANDING_START_HEIGHT = 48;

export { landingHeightFraction, landingProgress };

/** What the renderer needs from the rest of the scene (all optional so it also runs bare in tests). */
export interface ExtractorRendererDeps {
  particles?: ParticleEngine | null;
  /** Plays a landing/running sound at a world position (cells) at the slot's own volume. */
  playSound?: (sound: { url: string; volume: number }, position: { x: number; y: number }, spatial: typeof MINING_SPATIAL_AUDIO_PRESETS.EXTRACTOR) => void;
  /** Hold the flight until `start()` (the loading screen is still up); a machine already landed ignores this. */
  startPaused?: boolean;
  /** Loads the art; defaults to the Pixi asset loader. */
  loadTexture?: (url: string) => Promise<Texture | null>;
}

const defaultLoadTexture = (url: string): Promise<Texture | null> => Assets.load<Texture>(url).catch(() => null);

/**
 * Draws the extractor on the surface and its landing intro: it flies in from above, comes down on an ease, and
 * kicks up dust and plays its landing sound when it touches. The intro is driven by `landingRemaining` from the
 * server's description, so a player who joins late gets a machine that is already down. Until the art exists
 * (ticket 128) a plain placeholder is drawn. This is a world graphic only; its UI is DOM.
 */
export class ExtractorRenderer {
  public readonly root = new Container();
  private readonly body = new Container();
  private elapsed: number;
  private landedShown: boolean;
  private serverLanded: boolean;
  private destroyed = false;
  private started: boolean;
  private playSound: ExtractorRendererDeps['playSound'];
  private particles: ParticleEngine | null;

  private readonly state: MiningExtractorClientState;
  private readonly deps: ExtractorRendererDeps;

  constructor(container: Container, state: MiningExtractorClientState, deps: ExtractorRendererDeps = {}) {
    this.state = state;
    this.deps = deps;
    this.playSound = deps.playSound;
    this.particles = deps.particles ?? null;
    this.elapsed = Math.max(0, state.landingSeconds - state.landingRemaining);
    this.landedShown = state.landingRemaining <= 0;
    this.started = deps.startPaused !== true || this.landedShown;
    this.serverLanded = this.landedShown;
    this.root.position.set(state.x * TILE_SIZE, state.y * TILE_SIZE);
    this.drawPlaceholder();
    this.root.addChild(this.body);
    container.addChild(this.root);
    this.applyOffset();
    if (state.textureUrl) this.loadArt(state.textureUrl);
  }

  /** The particle engine for the landing dust (set once it exists). */
  public setParticles(particles: ParticleEngine | null): void {
    this.particles = particles;
  }

  /** Where its sounds go (set once the sound manager exists; the scene builds the renderer first). */
  public setSoundPlayer(play: ExtractorRendererDeps['playSound']): void {
    this.playSound = play;
  }

  /** Lets the flight begin (the loading screen has gone). */
  public start(): void {
    this.started = true;
  }

  /** Whether the flight is running (or over). */
  public get hasStarted(): boolean {
    return this.started;
  }

  /** The server says it has landed (gameplay may use it); the drawn landing still finishes by itself. */
  public markLanded(): void {
    this.serverLanded = true;
  }

  /** Whether the server has said it is down. */
  public get isLanded(): boolean {
    return this.serverLanded;
  }

  /** Whether the intro has finished playing. */
  public get hasTouchedDown(): boolean {
    return this.landedShown;
  }

  /** Current height above its resting place, in cells. */
  public get heightAboveGround(): number {
    return this.landedShown ? 0 : landingHeightFraction(landingProgress(this.elapsed, this.state.landingSeconds)) * LANDING_START_HEIGHT;
  }

  /** Advances the landing by `deltaSeconds`. */
  public update(deltaSeconds: number): void {
    if (this.landedShown || this.destroyed || !this.started) return;
    this.elapsed += Math.max(0, deltaSeconds);
    if (this.elapsed >= this.state.landingSeconds) this.touchDown();
    this.applyOffset();
  }

  public destroy(): void {
    this.destroyed = true;
    this.root.destroy({ children: true });
  }

  private applyOffset(): void {
    this.body.position.y = -this.heightAboveGround * TILE_SIZE;
  }

  private touchDown(): void {
    this.landedShown = true;
    const feet = { x: (this.state.x + this.state.width / 2) * TILE_SIZE, y: (this.state.y + this.state.height) * TILE_SIZE };
    const effect: ParticleEffectConfig | null | undefined = this.state.landingEffect;
    if (effect) this.particles?.spawnBurst(effect, feet);
    const landing = this.state.sounds?.landing;
    if (landing?.url) {
      this.playSound?.(
        { url: landing.url, volume: landing.volume ?? 1 },
        { x: this.state.x + this.state.width / 2, y: this.state.y + this.state.height / 2 },
        MINING_SPATIAL_AUDIO_PRESETS.EXTRACTOR
      );
    }
  }

  /** A plain machine: body, a walkable deck on top, a hopper where the belt takes items in. */
  private drawPlaceholder(): void {
    const w = this.state.width * TILE_SIZE;
    const h = this.state.height * TILE_SIZE;
    const g = new Graphics();
    g.rect(0, 0, w, h).fill(0x475569).stroke({ width: 2, color: 0x1e293b });
    g.rect(0, 0, w, Math.max(2, TILE_SIZE * 0.6)).fill(0x94a3b8);
    g.rect(w * 0.1, h * 0.35, w * 0.3, h * 0.65).fill(0x334155);
    g.rect(w * 0.55, h * 0.3, w * 0.3, h * 0.25).fill(0xf59e0b);
    this.body.addChild(g);
  }

  private loadArt(url: string): void {
    const load = this.deps.loadTexture ?? defaultLoadTexture;
    void load(url).then((texture) => {
      if (!texture || this.destroyed) return;
      const sprite = new Sprite(texture);
      sprite.width = this.state.width * TILE_SIZE;
      sprite.height = this.state.height * TILE_SIZE;
      this.body.removeChildren().forEach((child) => child.destroy());
      this.body.addChild(sprite);
    });
  }
}
