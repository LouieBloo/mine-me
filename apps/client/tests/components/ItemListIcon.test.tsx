import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ItemListIcon } from '../../src/components/ItemListIcon/ItemListIcon';
import type { InventoryEntry } from '@nvg/shared';

// Mock components that might be problematic in jsdom or not needed for this unit test
vi.mock('../../src/components/HoverTooltip/HoverTooltip', () => ({
  HoverTooltip: ({ children }: any) => <div data-testid="hover-tooltip">{children}</div>,
}));

vi.mock('../../src/components/ItemTooltip/ItemTooltip', () => ({
  ItemTooltip: () => <div data-testid="item-tooltip">Tooltip Content</div>,
}));

describe('ItemListIcon', () => {
  const mockItem = {
    id: '1',
    name: 'Iron Sword',
    description: 'A simple sword',
    iconUrl: null,
    baseValue: 10,
    rarity: 'COMMON' as any,
    type: 'WEAPON' as any,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const mockEntry: InventoryEntry = {
    id: 'e1',
    itemId: '1',
    item: mockItem,
    quantity: 1,
    characterId: 'c1',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  it('renders the full item name when iconUrl is missing', () => {
    render(<ItemListIcon entry={mockEntry} />);
    
    const nameElement = screen.getByText('Iron Sword');
    expect(nameElement).toBeDefined();
    expect(nameElement.classList.contains('item-name-text')).toBe(true);
  });

  it('renders the image when iconUrl is present', () => {
    const entryWithIcon = {
      ...mockEntry,
      item: { ...mockItem, iconUrl: '/icons/sword.png' },
    };
    
    render(<ItemListIcon entry={entryWithIcon} />);
    
    const img = screen.getByAltText('Iron Sword');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toContain('/icons/sword.png');
  });

  it('renders the quantity badge when quantity > 1', () => {
    const entryWithQuantity = {
      ...mockEntry,
      quantity: 5,
    };
    
    render(<ItemListIcon entry={entryWithQuantity} />);
    
    expect(screen.getByText('5')).toBeDefined();
  });

  it('does not render the quantity badge when quantity is 1', () => {
    render(<ItemListIcon entry={mockEntry} />);
    
    const badge = screen.queryByText('1');
    expect(badge).toBeNull();
  });
});
