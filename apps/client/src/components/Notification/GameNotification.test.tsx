import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GameNotification } from './GameNotification';

describe('GameNotification', () => {
  it('renders title and message', () => {
    render(<GameNotification title="Test Title" message="Test Message" />);
    expect(screen.getByText('Test Title')).toBeDefined();
    expect(screen.getByText('Test Message')).toBeDefined();
  });

  it('renders custom icon if provided', () => {
    render(<GameNotification title="Icon Test" iconUrl="https://example.com/icon.png" />);
    const img = screen.getByAltText('Icon Test');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/icon.png');
  });

  it('uses correct styles for success variant', () => {
    const { container } = render(<GameNotification title="Success" variant="success" />);
    expect(container.firstChild).toHaveProperty('className');
    expect((container.firstChild as HTMLElement).className).toContain('border-lear/50');
  });

  it('uses correct styles for error variant', () => {
    const { container } = render(<GameNotification title="Error" variant="error" />);
    expect((container.firstChild as HTMLElement).className).toContain('border-red-500/50');
  });

  it('uses correct styles for item variant with rarity', () => {
    const { container } = render(<GameNotification title="Rare Item" variant="item" rarity="RARE" />);
    expect((container.firstChild as HTMLElement).className).toContain('border-blue-500/50');
  });
});
