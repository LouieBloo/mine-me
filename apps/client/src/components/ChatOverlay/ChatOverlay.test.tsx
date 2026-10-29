import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatOverlay } from './ChatOverlay';

vi.mock('../ChatPanel/ChatPanel', () => ({ ChatPanel: () => <div>chat-panel</div> }));

describe('ChatOverlay', () => {
  it('shows the chat and folds down to its title bar', () => {
    render(<ChatOverlay />);
    const bar = screen.getByRole('button');
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('chat-panel').closest('.hidden')).toBeNull();
    fireEvent.click(bar);
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('chat-panel').closest('.hidden')).not.toBeNull();
  });
});
