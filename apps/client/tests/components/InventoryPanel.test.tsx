import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InventoryPanel } from '../../src/components/InventoryPanel/InventoryPanel';
import type { PlayerInventory } from '@nvg/shared';

// Mock components
vi.mock('../../src/components/ItemListIcon/ItemListIcon', () => ({
  ItemListIcon: ({ entry }: any) => <div data-testid="item-icon">{entry.item.name}</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { familyName: 'Stark' },
    logout: vi.fn(),
  }),
}));

describe('InventoryPanel', () => {
  const mockInventory: PlayerInventory = {
    slots: 10,
    items: [
      {
        id: 'e1',
        quantity: 1,
        equipped: false,
        item: {
          id: '1',
          name: 'Z-Copper Ore',
          description: 'Copper ore',
          type: 'MATERIAL' as any,
          subType: 'MINERAL' as any,
          rarity: 'LOW' as any,
          priceSol: 10,
        }
      },
      {
        id: 'e2',
        quantity: 5,
        equipped: false,
        item: {
          id: '2',
          name: 'Health Potion',
          description: 'Restores health',
          type: 'CONSUMABLE' as any,
          subType: 'POTION' as any,
          rarity: 'MEDIUM' as any,
          priceSol: 20,
        }
      },
      {
        id: 'e3',
        quantity: 1,
        equipped: true,
        item: {
          id: '3',
          name: 'Iron Helmet',
          description: 'A basic helmet',
          type: 'GEAR' as any,
          subType: 'HEAD' as any,
          rarity: 'RARE' as any,
          priceSol: 50,
        }
      }
    ]
  };

  it('renders nothing when inventory is null', () => {
    const { container } = render(<InventoryPanel inventory={null} />);
    expect(container.firstChild).toBeNull();
    cleanup();
  });

  it('renders section headers and slots count', () => {
    render(<InventoryPanel inventory={mockInventory} />);

    expect(screen.getByText('Backpack')).toBeDefined();
    expect(screen.getByText('Consumables')).toBeDefined();
    expect(screen.getByText('Materials')).toBeDefined();
    expect(screen.getByText('Gear (Equipment)')).toBeDefined();
    expect(screen.getByText('Empty Slots (7)')).toBeDefined();
    cleanup();
  });

  it('groups items correctly (consumables first, gear last)', () => {
    render(<InventoryPanel inventory={mockInventory} />);
    
    const items = screen.getAllByTestId('item-icon');
    expect(items).toHaveLength(3);
    // Consumable should be first, then material, then gear
    expect(items[0].textContent).toBe('Health Potion');
    expect(items[1].textContent).toBe('Z-Copper Ore');
    expect(items[2].textContent).toBe('Iron Helmet');
    cleanup();
  });

  it('sorts items by name within their categories', () => {
    const nameSortInventory: PlayerInventory = {
      slots: 10,
      items: [
        {
          id: 'e1',
          quantity: 1,
          equipped: false,
          item: { id: '1', name: 'Z-Copper Ore', type: 'MATERIAL' as any, rarity: 'LOW' as any, priceSol: 10 }
        },
        {
          id: 'e4',
          quantity: 1,
          equipped: false,
          item: { id: '4', name: 'A-Iron Ore', type: 'MATERIAL' as any, rarity: 'LOW' as any, priceSol: 10 }
        }
      ]
    };

    render(<InventoryPanel inventory={nameSortInventory} />);
    
    // Default order
    let mats = screen.getAllByTestId('item-icon');
    expect(mats[0].textContent).toBe('Z-Copper Ore');
    expect(mats[1].textContent).toBe('A-Iron Ore');

    // Click sort by name
    const nameSortBtn = screen.getByText('Name');
    fireEvent.click(nameSortBtn);

    mats = screen.getAllByTestId('item-icon');
    expect(mats[0].textContent).toBe('A-Iron Ore');
    expect(mats[1].textContent).toBe('Z-Copper Ore');
    cleanup();
  });

  it('sorts items by rarity within their categories', () => {
    const raritySortInventory: PlayerInventory = {
      slots: 10,
      items: [
        {
          id: 'e1',
          quantity: 1,
          equipped: false,
          item: { id: '1', name: 'Z-Copper Ore', type: 'MATERIAL' as any, rarity: 'LOW' as any, priceSol: 10 }
        },
        {
          id: 'e4',
          quantity: 1,
          equipped: false,
          item: { id: '4', name: 'Super Ore', type: 'MATERIAL' as any, rarity: 'VERY_RARE' as any, priceSol: 10 }
        }
      ]
    };

    render(<InventoryPanel inventory={raritySortInventory} />);
    
    // Default order
    let mats = screen.getAllByTestId('item-icon');
    expect(mats[0].textContent).toBe('Z-Copper Ore');
    expect(mats[1].textContent).toBe('Super Ore');

    // Click sort by rarity
    const raritySortBtn = screen.getByText('Rarity');
    fireEvent.click(raritySortBtn);

    mats = screen.getAllByTestId('item-icon');
    // LOW (1) is before VERY_RARE (4) in asc sort
    expect(mats[0].textContent).toBe('Z-Copper Ore');
    expect(mats[1].textContent).toBe('Super Ore');

    // Click again for desc sort
    fireEvent.click(raritySortBtn);
    mats = screen.getAllByTestId('item-icon');
    expect(mats[0].textContent).toBe('Super Ore');
    expect(mats[1].textContent).toBe('Z-Copper Ore');
    cleanup();
  });
});
