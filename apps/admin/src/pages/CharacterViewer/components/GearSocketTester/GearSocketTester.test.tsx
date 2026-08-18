import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GearSocketTester } from './GearSocketTester';

describe('GearSocketTester', () => {
  const mockItems = [
    { id: 'helm_1', name: 'Iron Helmet', type: 'GEAR', subType: 'HEAD', rarity: 'RARE' },
    { id: 'sword_1', name: 'Iron Sword', type: 'GEAR', subType: 'WEAPON', rarity: 'COMMON' },
  ];

  it('renders gear slots and selects items', () => {
    const setSelectedGear = vi.fn();
    render(
      <GearSocketTester
        items={mockItems}
        selectedGear={{ HEAD: 'helm_1' }}
        setSelectedGear={setSelectedGear}
        activeGearCount={1}
      />
    );

    expect(screen.getByText('HEAD Slot')).toBeDefined();
    expect(screen.getByText('WEAPON Slot')).toBeDefined();
    expect(screen.getByText(/Active Gear Overlays: 1 piece/i)).toBeDefined();

    const clearButton = screen.getByText('Clear All Gear');
    fireEvent.click(clearButton);
    expect(setSelectedGear).toHaveBeenCalledWith({});
  });
});
