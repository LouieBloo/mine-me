import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlideDrawer } from './SlideDrawer';

const drawer = () => render(<SlideDrawer label="Backpack" hotkey="i"><input aria-label="inside" /></SlideDrawer>);
const isOpen = () => screen.getByRole('button').getAttribute('aria-expanded') === 'true';

describe('SlideDrawer', () => {
  it('starts closed and opens and closes from its tab', () => {
    drawer();
    expect(isOpen()).toBe(false);
    fireEvent.click(screen.getByRole('button'));
    expect(isOpen()).toBe(true);
    fireEvent.click(screen.getByRole('button'));
    expect(isOpen()).toBe(false);
  });

  it('toggles with its hotkey', () => {
    drawer();
    fireEvent.keyDown(window, { key: 'i' });
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(window, { key: 'I' });
    expect(isOpen()).toBe(false);
  });

  it('ignores the hotkey while typing, with a modifier held, or for another key', () => {
    drawer();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(screen.getByLabelText('inside'), { key: 'i' });
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'x' });
    expect(isOpen()).toBe(true);
  });

  it('keeps its content out of reach while closed', () => {
    const { container } = drawer();
    expect(container.querySelector('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('[inert]')).toBeNull();
  });
});
