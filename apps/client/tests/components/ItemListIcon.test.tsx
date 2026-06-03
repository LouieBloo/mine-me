import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemListIcon } from '../../src/components/ItemListIcon/ItemListIcon';
import type { InventoryEntry } from '@nvg/shared';
import { useSocket } from '../../src/contexts/SocketContext';
import { notificationService } from '../../src/services/notificationService';

// Mock components that might be problematic in jsdom or not needed for this unit test
vi.mock('../../src/components/HoverTooltip/HoverTooltip', () => ({
  HoverTooltip: ({ children }: any) => <div data-testid="hover-tooltip">{children}</div>,
}));

vi.mock('../../src/components/ItemTooltip/ItemTooltip', () => ({
  ItemTooltip: () => <div data-testid="item-tooltip">Tooltip Content</div>,
}));

vi.mock('../../src/contexts/SocketContext', () => ({
  useSocket: vi.fn(() => ({
    sendGameEvent: vi.fn(),
  })),
}));

vi.mock('../../src/services/notificationService', () => ({
  notificationService: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ItemListIcon', () => {
  const mockItem = {
    id: '1',
    name: 'Iron Sword',
    description: 'A simple sword',
    iconUrl: null,
    baseValue: 10,
    rarity: 'COMMON' as any,
    type: 'GEAR' as any, // gear type
    subType: 'WEAPON' as any,
    priceSol: 10,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const mockEntry: InventoryEntry = {
    id: 'e1',
    item: mockItem as any,
    quantity: 1,
    equipped: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('renders the equipped badge when entry is equipped', () => {
    const equippedEntry = {
      ...mockEntry,
      equipped: true,
    };
    render(<ItemListIcon entry={equippedEntry} />);
    expect(screen.getByText('E')).toBeDefined();
  });

  it('does not render the equipped badge when entry is not equipped', () => {
    render(<ItemListIcon entry={mockEntry} />);
    expect(screen.queryByText('E')).toBeNull();
  });

  it('calls sendGameEvent to equip_item on double click when not equipped', async () => {
    const mockSendGameEvent = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useSocket).mockReturnValue({ sendGameEvent: mockSendGameEvent } as any);

    render(<ItemListIcon entry={mockEntry} />);
    
    const element = screen.getByText('Iron Sword').closest('div');
    expect(element).toBeDefined();
    if (element) {
      fireEvent.doubleClick(element);
    }
    
    expect(mockSendGameEvent).toHaveBeenCalledWith({
      type: 'equip_item',
      inventoryItemId: 'e1',
    });
  });

  it('calls sendGameEvent to unequip_item on double click when equipped', async () => {
    const mockSendGameEvent = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useSocket).mockReturnValue({ sendGameEvent: mockSendGameEvent } as any);

    const equippedEntry = {
      ...mockEntry,
      equipped: true,
    };
    render(<ItemListIcon entry={equippedEntry} />);
    
    const element = screen.getByText('Iron Sword').closest('div');
    expect(element).toBeDefined();
    if (element) {
      fireEvent.doubleClick(element);
    }
    
    expect(mockSendGameEvent).toHaveBeenCalledWith({
      type: 'unequip_item',
      inventoryItemId: 'e1',
    });
  });

  it('does not call sendGameEvent on double click if not GEAR type', async () => {
    const mockSendGameEvent = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(useSocket).mockReturnValue({ sendGameEvent: mockSendGameEvent } as any);

    const nonGearEntry = {
      ...mockEntry,
      item: {
        ...mockItem,
        type: 'CONSUMABLE' as any,
      },
    };
    render(<ItemListIcon entry={nonGearEntry} />);
    
    const element = screen.getByText('Iron Sword').closest('div');
    expect(element).toBeDefined();
    if (element) {
      fireEvent.doubleClick(element);
    }
    
    expect(mockSendGameEvent).not.toHaveBeenCalled();
  });

  it('shows error notification when sendGameEvent returns success: false', async () => {
    const mockSendGameEvent = vi.fn().mockResolvedValue({ success: false, error: 'Cannot equip helmet' });
    vi.mocked(useSocket).mockReturnValue({ sendGameEvent: mockSendGameEvent } as any);

    render(<ItemListIcon entry={mockEntry} />);
    
    const element = screen.getByText('Iron Sword').closest('div');
    expect(element).toBeDefined();
    if (element) {
      fireEvent.doubleClick(element);
    }
    
    await waitFor(() => {
      expect(notificationService.error).toHaveBeenCalledWith('Failed to equip', 'Cannot equip helmet');
    });
  });
});

