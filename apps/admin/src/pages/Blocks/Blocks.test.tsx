import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Blocks from './Blocks';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'block_dirt',
          typeKey: 'DIRT',
          name: 'Dirt',
          description: 'Standard earthen ground.',
          textureUrl: '/assets/mining/dirt-block.jpg',
          mineTimeMs: 500,
          staminaCost: 1,
        },
      ],
    }),
  }),
}));

describe('Blocks Page', () => {
  it('renders without crashing and displays header', () => {
    render(
      <ToastProvider>
        <BrowserRouter>
          <Blocks />
        </BrowserRouter>
      </ToastProvider>
    );
    expect(screen.getByText('MINING BLOCKS')).toBeInTheDocument();
  });
});
