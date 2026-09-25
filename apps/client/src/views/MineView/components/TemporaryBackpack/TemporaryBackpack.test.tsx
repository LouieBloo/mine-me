import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TemporaryBackpack } from './TemporaryBackpack';
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
});
