const STORAGE_KEY = 'nvg_surface_settings';

export interface SurfaceSettings {
  /** Caps how bright lightning flashes get, and skips the bolt (a photosensitivity setting). */
  reduceFlashes: boolean;
}

const DEFAULTS: SurfaceSettings = { reduceFlashes: false };

/**
 * The player's choices about the surface (ticket 134), kept in the browser. The game reads `reduceFlashes` every frame, so a
 * change in the settings window takes effect at once. Storage can be missing or refuse (private windows), so every read and
 * write is guarded and the default is used.
 */
export class SurfaceSettingsStore {
  private settings: SurfaceSettings;
  private readonly listeners = new Set<(settings: SurfaceSettings) => void>();

  constructor() {
    this.settings = this.load();
  }

  public get(): SurfaceSettings {
    return this.settings;
  }

  public get reduceFlashes(): boolean {
    return this.settings.reduceFlashes;
  }

  public setReduceFlashes(value: boolean): void {
    this.settings = { ...this.settings, reduceFlashes: Boolean(value) };
    this.save();
    for (const listener of this.listeners) listener(this.settings);
  }

  public subscribe(listener: (settings: SurfaceSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): SurfaceSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<SurfaceSettings>;
      return { reduceFlashes: typeof parsed.reduceFlashes === 'boolean' ? parsed.reduceFlashes : DEFAULTS.reduceFlashes };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // The choice still holds for this session
    }
  }
}

export const surfaceSettings = new SurfaceSettingsStore();
