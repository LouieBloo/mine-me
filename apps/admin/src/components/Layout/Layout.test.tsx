import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/doodads']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/doodads" element={<div>DOODADS PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('Layout navigation', () => {
  it('links to the world editors, including the biomes and doodads editors', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Biomes Editor' })).toHaveAttribute('href', '/biomes');
    expect(screen.getByRole('link', { name: 'Doodads Editor' })).toHaveAttribute('href', '/doodads');
    expect(screen.getByRole('link', { name: 'Surface Editor' })).toHaveAttribute('href', '/surface-environments');
  });

  it('marks the page you are on and shows it beside the menu', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Doodads Editor' }).className).toContain('bg-slate-200');
    expect(screen.getByRole('link', { name: 'Biomes Editor' }).className).not.toContain('bg-slate-200');
    expect(screen.getByText('DOODADS PAGE')).toBeInTheDocument();
  });
});
