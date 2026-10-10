import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider } from './ToastContext';
import { DEFINITIONS_RELOAD_FAILED_EVENT } from '../hooks/definitionsReloadEvent';

describe('ToastProvider', () => {
  it('warns the user when the live definitions reload failed', async () => {
    render(<ToastProvider><div /></ToastProvider>);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(DEFINITIONS_RELOAD_FAILED_EVENT));
    });
    expect(screen.getByText(/could not reload its definitions/i)).toBeTruthy();
  });
});
