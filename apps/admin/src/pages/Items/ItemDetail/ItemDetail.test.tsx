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
      if (url.includes('/api/admin/items/item_pickaxe')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'item_pickaxe',
            name: 'Iron Pickaxe',
            description: 'A trusty pickaxe',
            type: 'GEAR',
            subType: 'WEAPON',
            vendorBuyPrice: 100,
            vendorSellPrice: 50,
            userBuyPrice: 100,
            userSellPrice: 50,
            rarity: 'LOW',
            canBeDamaged: false,
            canBeClimbed: false,
            itemEffects: [],
            soundEffectUrl: '/assets/sounds/items/item_pickaxe_sfx.wav',
          })
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

  it('allows toggling Throwable checkbox', async () => {
    renderDetail('new');
    expect(await screen.findByText('World & In-Game Properties')).toBeDefined();

    const throwableCheckbox = screen.getByLabelText(/Throwable/i) as HTMLInputElement;
    expect(throwableCheckbox.checked).toBe(false);

    fireEvent.click(throwableCheckbox);
    expect(throwableCheckbox.checked).toBe(true);
  });

  it('renders Trigger Mode selector and allows changing to HOLD', async () => {
    renderDetail('item_torch');
    expect(await screen.findByText('Trigger Mode')).toBeDefined();

    const triggerModeSelect = screen.getByLabelText(/Trigger Mode/i) as HTMLSelectElement;
    expect(triggerModeSelect.value).toBe('SINGLE');

    fireEvent.change(triggerModeSelect, { target: { value: 'HOLD' } });
    expect(triggerModeSelect.value).toBe('HOLD');
  });

  it('renders 2D Collider & Rigid Body Editor within ItemDetail', async () => {
    renderDetail('item_torch');
    expect(await screen.findByText('2D Collider & Rigid Body Editor')).toBeDefined();
    expect(screen.getByRole('button', { name: /Circle/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Rectangle/i })).toBeDefined();
  });

  it('renders Weapon Sound Effect section when item subtype is WEAPON', async () => {
    renderDetail('item_pickaxe');
    expect(await screen.findByText(/Weapon Sound Effect/i)).toBeInTheDocument();
    expect(screen.getByText(/item_pickaxe_sfx\.wav/i)).toBeInTheDocument();
  });

  it('renders Item Key input and accepts value', async () => {
    renderDetail('new');
    expect(await screen.findByText(/Item Key/i)).toBeInTheDocument();

    const itemKeyInput = screen.getByPlaceholderText(/e\.g\. dynamite, ladder, torch/i) as HTMLInputElement;
    expect(itemKeyInput.value).toBe('');

    fireEvent.change(itemKeyInput, { target: { value: 'dynamite_v2' } });
    expect(itemKeyInput.value).toBe('dynamite_v2');
  });
});

