import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ExitPrompt } from './ExitPrompt';
import { useExitKey } from './useExitKey';

describe('ExitPrompt', () => {
  it('shows nothing away from the extraction point', () => {
    const { container } = render(<ExitPrompt visible={false} onLeave={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the key and a button that asks to leave when clicked', () => {
    const onLeave = vi.fn();
    render(<ExitPrompt visible onLeave={onLeave} />);
    expect(screen.getByText('E')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /leave the mine/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('useExitKey', () => {
  const press = (init: KeyboardEventInit = { key: 'e' }, target: Element | Window = window) => fireEvent.keyDown(target, init);

  it('calls back on E while enabled, in either case', () => {
    const onPress = vi.fn();
    renderHook(() => useExitKey(true, onPress));
    press({ key: 'e' });
    press({ key: 'E' });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('does nothing when not enabled, for other keys, with a modifier, on repeat, or while typing', () => {
    const onPress = vi.fn();
    renderHook(() => useExitKey(false, onPress));
    press();
    expect(onPress).not.toHaveBeenCalled();

    renderHook(() => useExitKey(true, onPress));
    press({ key: 'f' });
    press({ key: 'e', ctrlKey: true });
    press({ key: 'e', repeat: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    press({ key: 'e' }, input);
    input.remove();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('stops listening when disabled again', () => {
    const onPress = vi.fn();
    const { rerender } = renderHook(({ on }) => useExitKey(on, onPress), { initialProps: { on: true } });
    rerender({ on: false });
    press();
    expect(onPress).not.toHaveBeenCalled();
  });
});
