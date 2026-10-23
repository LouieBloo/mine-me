import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemporaryBackpack, backpackFillRatio } from './TemporaryBackpack';
import type { MiningBackpackItem } from '@mine-me/shared';
import '@testing-library/jest-dom';

describe('TemporaryBackpack Component', () => {
  it('renders empty message when no items are present', () => {
    render(<TemporaryBackpack items={[]} />);

    expect(screen.getByText(/Temporary Backpack/i)).toBeInTheDocument();
    expect(screen.getByText(/Backpack empty/i)).toBeInTheDocument();
    expect(screen.getByText(/0 items/i)).toBeInTheDocument();
  });

  it('renders list of items with quantities and images', () => {
    const mockItems: MiningBackpackItem[] = [
      {
        itemId: 'copper_ore',
        itemName: 'Copper Ore',
        iconUrl: '/assets/items/copper_ore.png',
        quantity: 5,
      },
      {
        itemId: 'gold_coin',
        itemName: 'Gold Coins',
        iconUrl: null,
        quantity: 25,
      },
    ];

    render(<TemporaryBackpack items={mockItems} />);

    expect(screen.getByText(/30 items/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByAltText('Copper Ore')).toBeInTheDocument();
  });

  it('renders Sol currency item with icon and quantity', () => {
    const mockItems: MiningBackpackItem[] = [
      {
        itemId: 'cmund29qj0000qr3nw7owbynf',
        itemName: 'Sol',
        iconUrl: '/assets/icons/items/cmund29qj0000qr3nw7owbynf_icon.png',
        quantity: 100,
      },
    ];

    render(<TemporaryBackpack items={mockItems} />);

    expect(screen.getByText(/100 items/i)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    const icon = screen.getByAltText('Sol');
    expect(icon).toBeInTheDocument();
    expect(icon.getAttribute('src')).toContain('/assets/icons/items/cmund29qj0000qr3nw7owbynf_icon.png');
  });
});

describe('TemporaryBackpack weight bar', () => {
  it('shows weight against capacity and fills in proportion', () => {
    render(<TemporaryBackpack items={[]} weight={25} capacity={100} />);
    expect(screen.getByText('25 / 100')).toBeInTheDocument();
    expect(screen.getByTestId('backpack-weight-fill')).toHaveStyle({ width: '25%' });
  });

  it('turns red and stops at 100% when full or over', () => {
    render(<TemporaryBackpack items={[]} weight={130} capacity={100} />);
    expect(screen.getByTestId('backpack-weight-fill')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('backpack-weight-fill').className).toContain('bg-red-500');
  });

  it('has no bar until the capacity is known', () => {
    render(<TemporaryBackpack items={[]} />);
    expect(screen.queryByTestId('backpack-weight')).not.toBeInTheDocument();
  });

  it('backpackFillRatio clamps and tolerates missing values', () => {
    expect(backpackFillRatio(50, 100)).toBe(0.5);
    expect(backpackFillRatio(-5, 100)).toBe(0);
    expect(backpackFillRatio(500, 100)).toBe(1);
    expect(backpackFillRatio(undefined, 100)).toBe(0);
    expect(backpackFillRatio(5, undefined)).toBe(1);
  });
});
