import type { BiomeDebugInfo } from '../systems/BiomeAmbient';

const STORAGE_KEY = 'miningBiomes';

/**
 * The biome debug overlay's switch and latest numbers (ticket 097), shared between the frame loop that fills it and the
 * panel that shows it. Off by default; F4 or `?miningBiomes=1` turns it on.
 */
class BiomeDebug {
  private _enabled = false;
  private _info: BiomeDebugInfo | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    try {
      this._enabled =
        new URLSearchParams(window.location.search).get('miningBiomes') === '1' || window.localStorage?.getItem(STORAGE_KEY) === '1';
    } catch {
      this._enabled = false;
    }
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    try {
      window.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // Storage blocked: the overlay still works, it just is not remembered
    }
    this.notify();
  }

  public get info(): BiomeDebugInfo | null {
    return this._info;
  }

  /** The frame loop hands over the latest numbers (only while the overlay is on). */
  public publish(info: BiomeDebugInfo | null): void {
    this._info = info;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const biomeDebug = new BiomeDebug();
