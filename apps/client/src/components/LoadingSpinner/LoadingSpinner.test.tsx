import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders an accessible status with an optional message', () => {
    render(<LoadingSpinner message="Connecting" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Connecting')).toBeTruthy();
  });

  it('fills the viewport in fullScreen mode', () => {
    render(<LoadingSpinner fullScreen />);
    expect(screen.getByRole('status').className).toContain('min-h-screen');
  });
});
