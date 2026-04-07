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
(global as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

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
  },
  Sprite: class {},
  Container: class {},
}));
