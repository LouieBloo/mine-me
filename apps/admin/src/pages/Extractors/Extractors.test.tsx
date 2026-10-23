import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Extractors from './Extractors';
import { ToastProvider } from '../../contexts/ToastContext';

const mockFetchWithAuth = vi.fn();
vi.mock('../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: mockFetchWithAuth }) }));

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const renderIt = () =>
  render(
    <MemoryRouter initialEntries={['/extractors']}>
      <ToastProvider>
        <Routes>
          <Route path="/extractors" element={<Extractors />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );

describe('Extractors list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists extractors with their key, size and rates', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [{ id: 'e1', key: 'basic_extractor', name: 'Basic', width: 12, height: 9, buildSecondsPerSegment: 1.5, beltSpeed: 6, isDefault: true }] });
    renderIt();
    expect(await screen.findByText('basic_extractor')).toBeInTheDocument();
    expect(screen.getByText('12 x 9')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Extractor' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/extractors/e1');
  });

  it('says so when there are none, and offers a new one', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: true, json: async () => [] });
    renderIt();
    expect(await screen.findByText('No extractors yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ New Extractor' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/extractors/new');
  });

  it('shows a failed load', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderIt();
    expect(await screen.findByText('Failed to fetch extractors')).toBeInTheDocument();
  });
});
