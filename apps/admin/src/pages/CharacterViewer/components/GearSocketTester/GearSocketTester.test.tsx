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

  it('renders tool socket controls and responds to tuning step clicks', () => {
    const onStep = vi.fn();
    const onChange = vi.fn();
    const onReset = vi.fn();

    render(
      <GearSocketTester
        items={mockItems}
        selectedGear={{ WEAPON: 'sword_1' }}
        setSelectedGear={vi.fn()}
        activeGearCount={1}
        toolSocketOverride={{
          offsetX: -10,
          offsetY: 120,
          scale: 1,
          rotation: 0,
        }}
        onChangeToolSocket={onChange}
        onStepToolSocket={onStep}
        onResetToolSocket={onReset}
      />
    );

    expect(screen.getByText(/Weapon Socket Tuning/i)).toBeDefined();
    const plusButtons = screen.getAllByText('+');
    expect(plusButtons.length).toBeGreaterThan(0);
    fireEvent.click(plusButtons[0]);
    expect(onStep).toHaveBeenCalled();

    const resetButton = screen.getByText('Reset Socket');
    fireEvent.click(resetButton);
    expect(onReset).toHaveBeenCalled();
  });
});
