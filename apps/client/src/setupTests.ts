import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill atob/btoa if missing (though jsdom should provide them)
if (typeof global.atob === 'undefined') {
    global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

if (typeof global.btoa === 'undefined') {
    global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

// Stub ResizeObserver (not available in jsdom)
const MockResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

(global as any).ResizeObserver = MockResizeObserver;
(globalThis as any).ResizeObserver = MockResizeObserver;
if (typeof window !== 'undefined') {
    (window as any).ResizeObserver = MockResizeObserver;
}

// Mock import.meta.env
vi.stubGlobal('import.meta', {
    env: {
        VITE_API_URL: 'http://localhost:4000',
    },
});

import React from 'react';

// Mock PixiJS components
vi.mock('@pixi/react', () => ({
  Application: ({ children }: any) => React.createElement('div', null, children),
  extend: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Assets: {
    load: vi.fn().mockResolvedValue({}),
  },
  Texture: {
    EMPTY: {},
    from: vi.fn().mockReturnValue({ destroy: vi.fn() }),
  },
  Sprite: class {
    anchor = { set: vi.fn() };
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
    texture = { destroy: vi.fn() };
    destroy = vi.fn();
  },
  Container: class {},
}));

// Mock HTMLMediaElement methods for JSDOM
if (typeof window !== 'undefined' && window.HTMLMediaElement) {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
}
