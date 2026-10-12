import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QuickAccessBar } from '../../src/components/QuickAccessBar/QuickAccessBar';
import * as QuickAccessContextModule from '../../src/contexts/QuickAccessContext';

// Mock HoverTooltip and ItemTooltip
vi.mock('../../src/components/HoverTooltip/HoverTooltip', () => ({
  HoverTooltip: ({ children }: any) => <div data-testid="hover-tooltip">{children}</div>,
}));

vi.mock('../../src/components/ItemTooltip/ItemTooltip', () => ({
  ItemTooltip: () => <div data-testid="item-tooltip">Tooltip</div>,
}));

describe('QuickAccessBar', () => {
  const mockSelectSlot = vi.fn();
  const mockSetSlotItem = vi.fn();
  const mockSwapSlots = vi.fn();
  const mockGetSlotEntry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation: slots 0-2 filled, rest empty
    mockGetSlotEntry.mockImplementation((index: number) => {
      if (index === 0) {
        return {
          entry: {
            id: 'torch-entry-1',
            quantity: 5,
            equipped: false,
            item: {
              id: 'item-torch',
              name: 'Torch',
              type: 'CONSUMABLE',
              subType: 'TORCH',
              iconUrl: '/assets/torch.png',
            },
          },
          totalQuantity: 5,
        };
      }
      if (index === 1) {
        return {
          entry: {
            id: 'pickaxe-entry-1',
            quantity: 1,
            equipped: true,
            item: {
              id: 'item-pickaxe',
              name: 'Iron Pickaxe',
              type: 'GEAR',
              subType: 'WEAPON',
            },
          },
          totalQuantity: 1,
        };
      }
      if (index === 2) {
        // Depleted item test (0 quantity)
        return {
          entry: {
            id: 'potion-entry-1',
            quantity: 0,
            equipped: false,
            item: {
              id: 'item-potion',
              name: 'Health Potion',
              type: 'CONSUMABLE',
              subType: 'POTION',
            },
          },
          totalQuantity: 0,
        };
      }
      return { entry: null, totalQuantity: 0 };
    });

    vi.spyOn(QuickAccessContextModule, 'useQuickAccess').mockReturnValue({
      quickSlotItemIds: ['item-torch', 'item-pickaxe', 'item-potion', ...Array(7).fill(null)],
      selectedSlotIndex: 0,
      selectSlot: mockSelectSlot,
      setSlotItem: mockSetSlotItem,
      swapSlots: mockSwapSlots,
      getSlotEntry: mockGetSlotEntry,
      isPlacingTorch: false,
      setIsPlacingTorch: vi.fn(),
    });
  });

  it('renders 10 slots labelled 1-9 then 0 in the top right', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');
    expect(slots.length).toBe(10);

    const labels = Array.from(slots).map(slot => slot.querySelector('span')?.textContent?.trim());
    expect(labels).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  });

  it('applies selected glow styling to the active slot (slot 1)', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');
    expect(slots.length).toBe(10);

    // Slot 0 is selected
    expect(slots[0].className).toContain('border-amber-400');
    expect(slots[0].className).toContain('quick-access-slot-selected');

    // Slot 1 is not selected
    expect(slots[1].className).not.toContain('border-amber-400');
  });

  it('displays item details, quantity, equipped badge, and empty placeholder', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');

    // Slot 0 has 5 torches (quantity badge, not the key label)
    expect(within(slots[0] as HTMLElement).getByText('5')).toBeDefined();

    // Slot 1 has Iron Pickaxe and is equipped ('E')
    expect(screen.getByText('E')).toBeDefined();

    // Slot 2 has depleted item with 0 quantity
    expect(within(slots[2] as HTMLElement).getByText('0')).toBeDefined();

    // Empty slots show '+'
    expect(screen.getAllByText('+')[0]).toBeDefined();
  });

  it('is a standalone HTML strip with a test id', () => {
    render(<QuickAccessBar />);
    expect(screen.getByTestId('quick-access-bar')).toBeDefined();
  });

  it('calls selectSlot when a slot is clicked', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');
    fireEvent.click(slots[1]);

    expect(mockSelectSlot).toHaveBeenCalledWith(1);
  });

  it('clears a slot on right click (context menu)', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');
    fireEvent.contextMenu(slots[0]);

    expect(mockSetSlotItem).toHaveBeenCalledWith(0, null);
  });

  it('handles item drop from backpack to slot', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');

    // Simulate drop from backpack
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: (format: string) => {
          if (format === 'application/json') {
            return JSON.stringify({ itemDefinitionId: 'new-item-123' });
          }
          return '';
        },
      },
    };

    fireEvent.drop(slots[3], dropEvent);
    expect(mockSetSlotItem).toHaveBeenCalledWith(3, 'new-item-123');
  });

  it('handles slot swapping on quick slot drag and drop', () => {
    const { container } = render(<QuickAccessBar />);

    const slots = container.querySelectorAll('.quick-access-slot');

    // Simulate dragging slot 0 onto slot 1
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: (format: string) => {
          if (format === 'quick-slot-index') {
            return '0';
          }
          return '';
        },
      },
    };

    fireEvent.drop(slots[1], dropEvent);
    expect(mockSwapSlots).toHaveBeenCalledWith(0, 1);
  });
});
