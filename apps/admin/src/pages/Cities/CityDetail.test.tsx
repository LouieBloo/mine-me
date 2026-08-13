import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CityDetail from './CityDetail';
import { ToastProvider } from '../../contexts/ToastContext';

const mockCity = {
  id: 'city_1',
  name: 'Test City',
  description: 'A test city',
  cityDungeons: [
    { id: 'cd_1', cityId: 'city_1', dungeonId: 'dung_1', dungeon: { id: 'dung_1', name: 'Goblin Cave', minLevel: 1 } }
  ],
  cityMaterials: [
    { id: 'cm_1', cityId: 'city_1', itemId: 'item_1', item: { id: 'item_1', name: 'Cedarbark', type: 'MATERIAL', subType: 'LUMBER', rarity: 'LOW' } }
  ]
};

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/cities/city_1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCity)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    })
  })
}));

describe('CityDetail Page', () => {
  const renderDetail = (id = 'city_1') => {
    render(
      <MemoryRouter initialEntries={[`/cities/${id}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/cities/:id" element={<CityDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  };

  it('renders without crashing for existing city', () => {
    renderDetail('city_1');
    expect(document.body).toBeDefined();
  });

  it('renders new city form', () => {
    renderDetail('new');
    expect(screen.getByText('NEW CITY')).toBeDefined();
  });

  it('shows MATERIALS section for existing city', async () => {
    renderDetail('city_1');
    // Wait for data to load
    const materialsHeading = await screen.findByText('MATERIALS');
    expect(materialsHeading).toBeDefined();
  });
});
