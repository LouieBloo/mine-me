import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RewardItemsEditor from './RewardItemsEditor';

const items = [{ id: 'i1', name: 'Copperium' }, { id: 'i2', name: 'Silverium' }];
const reward = { itemId: 'i1', chance: 50, minQuantity: 1, maxQuantity: 2 };

describe('RewardItemsEditor', () => {
  it('changes the item, chance and quantity range of a row', () => {
    const onChange = vi.fn();
    render(<RewardItemsEditor value={[reward]} items={items} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Reward 1 item'), { target: { value: 'i2' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...reward, itemId: 'i2' }]);
    fireEvent.change(screen.getByLabelText('Reward 1 chance'), { target: { value: '75' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...reward, chance: 75 }]);
    fireEvent.change(screen.getByLabelText('Reward 1 minimum'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...reward, minQuantity: 2 }]);
    fireEvent.change(screen.getByLabelText('Reward 1 maximum'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...reward, maxQuantity: 4 }]);
  });

  it('adds a row starting with the first item, and removes a row', () => {
    const onChange = vi.fn();
    render(<RewardItemsEditor value={[reward]} items={items} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add Reward Item'));
    expect(onChange).toHaveBeenLastCalledWith([reward, { itemId: 'i1', chance: 100, minQuantity: 1, maxQuantity: 1 }]);
    fireEvent.click(screen.getByLabelText('Remove reward 1'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('says the mission pays coins and XP only when there are no rows', () => {
    render(<RewardItemsEditor value={[]} items={items} onChange={vi.fn()} />);
    expect(screen.getByText(/coins and XP only/)).toBeInTheDocument();
  });
});
