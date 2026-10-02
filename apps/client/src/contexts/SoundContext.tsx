import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { SoundSettings, Vector2D } from '@mine-me/shared';
import { soundManager, SoundManager, type PlaySfxOptions } from '../services/sound';

interface SoundContextType {
  settings: SoundSettings;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  bgmVolume: number;
  sfxVolume: number;
  toggleBgm: () => void;
  toggleSfx: () => void;
  setBgmVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  playSfx: (url: string, volumeScale?: number | PlaySfxOptions) => void;
  playPositionalSfx: (url: string, position: Vector2D, options?: PlaySfxOptions) => void;
  setListenerPosition: (pos: Vector2D | null) => void;
  startSessionBgm: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  soundManager: SoundManager;
}

const SoundContext = createContext<SoundContextType | null>(null);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SoundSettings>(() => soundManager.getSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    // Initialize sound manager and fetch active tracks
    soundManager.init();

    // Subscribe to soundManager settings changes
    const unsubscribe = soundManager.subscribe((newSettings) => {
      setSettings(newSettings);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo<SoundContextType>(() => ({
    settings,
    bgmEnabled: settings.bgmEnabled,
    sfxEnabled: settings.sfxEnabled,
    bgmVolume: settings.bgmVolume,
    sfxVolume: settings.sfxVolume,
    toggleBgm: () => soundManager.toggleBgm(),
    toggleSfx: () => soundManager.toggleSfx(),
    setBgmVolume: (vol: number) => soundManager.setBgmVolume(vol),
    setSfxVolume: (vol: number) => soundManager.setSfxVolume(vol),
    playSfx: (url: string, volumeScale?: number | PlaySfxOptions) => soundManager.playSfx(url, volumeScale),
    playPositionalSfx: (url: string, position: Vector2D, options?: PlaySfxOptions) =>
      soundManager.playPositionalSfx(url, position, options),
    setListenerPosition: (pos: Vector2D | null) => soundManager.setListenerPosition(pos),
    startSessionBgm: () => soundManager.startSessionBgm(),
    isSettingsOpen,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
    soundManager,
  }), [settings, isSettingsOpen]);

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = (): SoundContextType => {
  const context = useContext(SoundContext);
  if (!context) {
    // Graceful fallback for components rendered outside SoundProvider (e.g. in isolated unit tests)
    const settings = soundManager.getSettings();
    return {
      settings,
      bgmEnabled: settings.bgmEnabled,
      sfxEnabled: settings.sfxEnabled,
      bgmVolume: settings.bgmVolume,
      sfxVolume: settings.sfxVolume,
      toggleBgm: () => soundManager.toggleBgm(),
      toggleSfx: () => soundManager.toggleSfx(),
      setBgmVolume: (vol: number) => soundManager.setBgmVolume(vol),
      setSfxVolume: (vol: number) => soundManager.setSfxVolume(vol),
      playSfx: (url: string, scale?: number | PlaySfxOptions) => soundManager.playSfx(url, scale),
      playPositionalSfx: (url: string, position: Vector2D, options?: PlaySfxOptions) =>
        soundManager.playPositionalSfx(url, position, options),
      setListenerPosition: (pos: Vector2D | null) => soundManager.setListenerPosition(pos),
      startSessionBgm: () => soundManager.startSessionBgm(),
      isSettingsOpen: false,
      openSettings: () => {},
      closeSettings: () => {},
      soundManager,
    };
  }
  return context;
};
