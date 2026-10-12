import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { InventoryPanel } from './InventoryPanel';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'a@b.c' }, logout: vi.fn() }),
}));

describe('InventoryPanel', () => {
  it('does not render the quick access hotbar (it lives on the mining screen)', () => {
    render(
      <MemoryRouter>
        <InventoryPanel inventory={{ items: [], slots: 20 } as any} />
      </MemoryRouter>
    );
    expect(screen.getByText('Backpack')).toBeDefined();
    expect(screen.queryByTestId('quick-access-bar')).toBeNull();
    expect(screen.queryByText(/Quick Access/)).toBeNull();
  });
});
