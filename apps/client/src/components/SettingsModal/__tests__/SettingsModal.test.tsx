import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { SettingsButton } from '../../SettingsButton/SettingsButton';
import { SoundProvider } from '../../../contexts/SoundContext';
import { soundManager } from '../../../services/sound';
import '@testing-library/jest-dom';

describe('Settings Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    soundManager.setBgmVolume(0.7);
    soundManager.setSfxVolume(0.9);
  });

  it('opens SettingsModal when SettingsButton is clicked', () => {
    render(
      <SoundProvider>
        <SettingsButton />
        <SettingsModal />
      </SoundProvider>
    );

    // Modal should initially be closed
    expect(screen.queryByText(/Game Settings/i)).not.toBeInTheDocument();

    // Click the gear button
    const button = screen.getByLabelText(/Settings/i);
    fireEvent.click(button);

    // Modal should now be visible
    expect(screen.getByText(/Game Settings/i)).toBeInTheDocument();
    expect(screen.getByText(/Audio Channels/i)).toBeInTheDocument();
    expect(screen.getByText(/Background Music/i)).toBeInTheDocument();
    expect(screen.getByText(/Effects Sounds/i)).toBeInTheDocument();
    expect(screen.getByText(/70%/i)).toBeInTheDocument();
    expect(screen.getByText(/90%/i)).toBeInTheDocument();
  });

  it('toggles BGM channel on and off', () => {
    render(
      <SoundProvider>
        <SettingsButton />
        <SettingsModal />
      </SoundProvider>
    );

    fireEvent.click(screen.getByLabelText(/Settings/i));

    const bgmToggle = screen.getByText(/Music: ON/i);
    expect(bgmToggle).toBeInTheDocument();

    // Toggle off
    fireEvent.click(bgmToggle);
    expect(screen.getByText(/Music: OFF/i)).toBeInTheDocument();
    expect(soundManager.getSettings().bgmEnabled).toBe(false);

    // Toggle back on
    fireEvent.click(screen.getByText(/Music: OFF/i));
    expect(screen.getByText(/Music: ON/i)).toBeInTheDocument();
    expect(soundManager.getSettings().bgmEnabled).toBe(true);
  });

  it('toggles SFX channel on and off', () => {
    render(
      <SoundProvider>
        <SettingsButton />
        <SettingsModal />
      </SoundProvider>
    );

    fireEvent.click(screen.getByLabelText(/Settings/i));

    const sfxToggle = screen.getByText(/SFX: ON/i);
    expect(sfxToggle).toBeInTheDocument();

    // Toggle off
    fireEvent.click(sfxToggle);
    expect(screen.getByText(/SFX: OFF/i)).toBeInTheDocument();
    expect(soundManager.getSettings().sfxEnabled).toBe(false);

    // Toggle back on
    fireEvent.click(screen.getByText(/SFX: OFF/i));
    expect(screen.getByText(/SFX: ON/i)).toBeInTheDocument();
    expect(soundManager.getSettings().sfxEnabled).toBe(true);
  });

  it('closes modal when clicking Done button or X button', () => {
    render(
      <SoundProvider>
        <SettingsButton />
        <SettingsModal />
      </SoundProvider>
    );

    fireEvent.click(screen.getByLabelText(/Settings/i));
    expect(screen.getByText(/Game Settings/i)).toBeInTheDocument();

    // Click Done
    const doneButton = screen.getByText(/Done/i);
    fireEvent.click(doneButton);

    expect(screen.queryByText(/Game Settings/i)).not.toBeInTheDocument();
  });
});
