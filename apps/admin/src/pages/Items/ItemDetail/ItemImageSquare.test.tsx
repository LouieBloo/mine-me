import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemIconUpload from './ItemIconUpload';
import ItemInGameSpriteUpload from './ItemInGameSpriteUpload/ItemInGameSpriteUpload';

const toastError = vi.fn();
vi.mock('../../../hooks/useApi', () => ({ useApi: () => ({ fetchWithAuth: vi.fn() }) }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: toastError }) }));

/** Makes `new Image()` report the given size as soon as a src is set. */
function stubImageSize(width: number, height: number) {
  class FakeImage {
    width = width;
    height = height;
    onload: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x' });
}

const png = () => new File(['x'], 'sprite.png', { type: 'image/png' });
const flush = () => new Promise((r) => setTimeout(r, 0));

const uploaders = [
  { name: 'icon', render: () => render(<ItemIconUpload itemId="i1" iconUrl={null} onUploadSuccess={vi.fn()} />), button: /Upload Icon/i },
  { name: 'in-game sprite', render: () => render(<ItemInGameSpriteUpload itemId="i1" inGameSpriteUrl={null} onUploadSuccess={vi.fn()} />), button: /Upload In-Game Sprite/i },
];

describe.each(uploaders)('$name upload accepts any square size', ({ render: mount, button }) => {
  beforeEach(() => toastError.mockClear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const pick = async () => {
    const { container } = mount();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await flush();
  };

  it.each([[64], [256], [512], [1024]])('takes a %i x %i image', async (size) => {
    stubImageSize(size, size);
    await pick();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
  });

  it.each([[512, 256], [256, 512]])('rejects a %i x %i image as not square', async (w, h) => {
    stubImageSize(w, h);
    await pick();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining(`must be square`));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining(`${w}x${h}`));
  });
});
