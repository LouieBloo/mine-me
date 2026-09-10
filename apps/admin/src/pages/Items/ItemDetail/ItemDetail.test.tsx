import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ItemDetail from './ItemDetail';
import { ToastProvider } from '../../../contexts/ToastContext';

const mockItem = {
  id: 'item_torch',
  name: 'Torch',
  description: 'A torch to light your way',
  type: 'CONSUMABLE',
  subType: 'TORCH',
  vendorBuyPrice: 10,
  vendorSellPrice: 5,
  userBuyPrice: 10,
  userSellPrice: 5,
  rarity: 'LOW',
  canBeDamaged: false,
  canBeClimbed: false,
  itemEffects: []
};

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/item-enums')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            types: ['GEAR', 'MATERIAL', 'CONSUMABLE'],
            subTypes: { CONSUMABLE: ['TORCH', 'LADDER', 'POTION'] },
            rarities: ['LOW', 'MEDIUM', 'RARE', 'VERY_RARE']
          })
        });
      }
      if (url.includes('/api/admin/effects')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/api/admin/items/item_torch')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockItem)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    })
  })
}));

describe('ItemDetail Page', () => {
  const renderDetail = (id = 'item_torch') => {
    render(
      <MemoryRouter initialEntries={[`/items/${id}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/items/:id" element={<ItemDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  };

  it('renders without crashing for existing item', async () => {
    renderDetail('item_torch');
    expect(await screen.findByText('World & In-Game Properties')).toBeDefined();
    expect(screen.getByText('Can Be Damaged')).toBeDefined();
    expect(screen.getByText('Can Be Climbed')).toBeDefined();
  });

  it('allows toggling Can Be Damaged and Can Be Climbed checkboxes', async () => {
    renderDetail('new');
    expect(await screen.findByText('World & In-Game Properties')).toBeDefined();

    const damageCheckbox = screen.getByLabelText(/Can Be Damaged/i) as HTMLInputElement;
    const climbCheckbox = screen.getByLabelText(/Can Be Climbed/i) as HTMLInputElement;

    expect(damageCheckbox.checked).toBe(false);
    expect(climbCheckbox.checked).toBe(false);

    fireEvent.click(damageCheckbox);
    expect(damageCheckbox.checked).toBe(true);

    fireEvent.click(climbCheckbox);
    expect(climbCheckbox.checked).toBe(true);
  });
});
