import { Howl } from 'howler';

export type ChannelName = 'bgm' | 'sfx';

export class SoundChannel {
  public readonly name: ChannelName;
  private volume: number;
  private enabled: boolean;
  private activeHowls: Map<Howl, number> = new Map();

  constructor(
    name: ChannelName,
    volume: number = 1.0,
    enabled: boolean = true
  ) {
    this.name = name;
    this.volume = Math.max(0, Math.min(1, volume));
    this.enabled = enabled;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolume();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVolume();
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public getEffectiveVolume(): number {
    return this.enabled ? this.volume : 0;
  }

  public register(howl: Howl, scale: number = 1.0): void {
    this.activeHowls.set(howl, scale);
    howl.volume(this.getEffectiveVolume() * scale);

    // Clean up automatically when howl unloads or stops
    howl.on('end', () => {
      if (!howl.loop()) {
        this.activeHowls.delete(howl);
      }
    });
  }

  public unregister(howl: Howl): void {
    this.activeHowls.delete(howl);
  }

  public stopAll(): void {
    for (const howl of this.activeHowls.keys()) {
      howl.stop();
    }
    this.activeHowls.clear();
  }

  public applyVolume(): void {
    const effective = this.getEffectiveVolume();
    for (const [howl, scale] of this.activeHowls.entries()) {
      howl.volume(effective * scale);
    }
  }

  public fade(howl: Howl, from: number, to: number, durationMs: number): void {
    const targetVolume = this.enabled ? to * this.volume : 0;
    howl.fade(from, targetVolume, durationMs);
  }
}
