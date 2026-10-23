import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BeltStatus, BELT_WAIT_TEXT } from './BeltStatus';

describe('BeltStatus', () => {
  it('shows how deep the belt is, with the right plural', () => {
    const { rerender } = render(<BeltStatus rows={1} blockedBy={null} />);
    expect(screen.getByText('1 segment deep')).toBeInTheDocument();
    rerender(<BeltStatus rows={7} blockedBy={null} />);
    expect(screen.getByText('7 segments deep')).toBeInTheDocument();
  });

  it('says nothing about waiting while it digs', () => {
    render(<BeltStatus rows={3} blockedBy={null} />);
    expect(screen.queryByTestId('belt-wait')).not.toBeInTheDocument();
  });

  it('tells the player what to clear for each reason it waits', () => {
    for (const reason of ['fluid', 'gas', 'fire', 'rock', 'solid', 'bottom'] as const) {
      const { unmount } = render(<BeltStatus rows={3} blockedBy={reason} />);
      expect(screen.getByTestId('belt-wait')).toHaveTextContent(BELT_WAIT_TEXT[reason]);
      unmount();
    }
  });
});
