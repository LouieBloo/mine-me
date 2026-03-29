import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntityPicker } from './EntityPicker';
import '@testing-library/jest-dom';

const mockFetchWithAuth = vi.fn();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth
  })
}));

describe('EntityPicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with placeholder when no value provided', () => {
    render(
      <EntityPicker 
        entityType="items" 
        value="" 
        onChange={vi.fn()} 
        placeholder="Select Item Here" 
      />
    );
    expect(screen.getByText('Select Item Here')).toBeInTheDocument();
  });

  it('fetches entity name correctly on mount when value is provided', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'item_1', name: 'Iron Sword' })
    });

    render(
      <EntityPicker 
        entityType="items" 
        value="item_1" 
        onChange={vi.fn()} 
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Iron Sword')).toBeInTheDocument();
    });
  });

  it('opens dropdown and fetches items list on click', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { id: 'item_A', name: 'Magic Stick' },
        { id: 'item_B', name: 'Wooden Shield' }
      ])
    });

    render(
      <EntityPicker 
        entityType="items" 
        value="" 
        onChange={vi.fn()} 
      />
    );

    fireEvent.click(screen.getByText('Select items...'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type to search...')).toBeInTheDocument();
      expect(mockFetchWithAuth).toHaveBeenCalled(); // Should attempt to query API for items list
      expect(screen.getByText('Magic Stick')).toBeInTheDocument();
      expect(screen.getByText('Wooden Shield')).toBeInTheDocument();
    });
  });
});
