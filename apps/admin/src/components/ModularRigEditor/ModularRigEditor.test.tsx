import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModularRigEditor from './ModularRigEditor';
import { ToastProvider } from '../../contexts/ToastContext';

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockApplication {
    canvas = document.createElement('canvas');
    stage = { addChild: vi.fn(), removeChild: vi.fn() };
    ticker = { add: vi.fn(), remove: vi.fn() };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();
  }
  class MockContainer {
    children: any[] = [];
    x = 0;
    y = 0;
    rotation = 0;
    scale = { x: 1, y: 1 };
    addChild(c: any) {
      this.children.push(c);
    }
    removeChild(c: any) {
      this.children = this.children.filter((x) => x !== c);
    }
  }
  class MockSprite {
    anchor = { set: vi.fn() };
    x = 0;
    y = 0;
    rotation = 0;
    visible = true;
    tint = 0xffffff;
  }
  class MockGraphics {
    clear = vi.fn();
    moveTo = vi.fn();
    lineTo = vi.fn();
    stroke = vi.fn();
    circle = vi.fn();
    fill = vi.fn();
    rect = vi.fn();
  }
  return {
    Application: MockApplication,
    Container: MockContainer,
    Sprite: MockSprite,
    Graphics: MockGraphics,
    Texture: { EMPTY: {} },
    Assets: { load: vi.fn().mockResolvedValue({}) },
  };
});

const mockManifest = {
  version: '2.0',
  canvas_size: [1024, 1024],
  pelvis_origin: [512, 590],
  parts: {
    head: {
      file: 'head.png',
      width: 199,
      height: 240,
      bbox: [0, 0, 219, 260],
      pivot_anchor: [0.46, 0.94],
      offset_from_pelvis: [7, -225],
      z_index: 30,
      slot: 'HEAD',
    },
    torso: {
      file: 'torso.png',
      width: 303,
      height: 310,
      bbox: [0, 0, 303, 310],
      pivot_anchor: [0.5, 0.94],
      offset_from_pelvis: [-25, 15],
      z_index: 20,
      slot: 'CHEST',
    },
  },
};

const mockFetchWithAuth = vi.fn().mockImplementation((url: string, opts?: any) => {
  if (url.includes('/api/admin/mobs/mob-123') && opts?.method === 'PUT') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'mob-123', name: 'Goblin', animations: mockManifest }),
    });
  }
  if (url.includes('/api/admin/mobs/mob-123')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ id: 'mob-123', name: 'Goblin', animations: mockManifest }),
    });
  }
  if (url.includes('/api/admin/items')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'item_1',
            name: 'Iron Helmet',
            type: 'GEAR',
            subType: 'HEAD',
            gearImageUrl: '/assets/gear/helm.png',
          },
        ]),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

describe('ModularRigEditor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      })
    );
  });

  it('renders correctly for character target with header and parts', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ModularRigEditor target={{ type: 'character' }} showHeader={true} />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Character Model & Rig Inspector')).toBeDefined();
    });

    expect(screen.getByText('head')).toBeDefined();
    expect(screen.getByText('torso')).toBeDefined();
  });

  it('renders correctly for mob target and saves mob rig configuration', async () => {
    const onSaveSuccess = vi.fn();

    render(
      <MemoryRouter>
        <ToastProvider>
          <ModularRigEditor
            target={{ type: 'mob', mobId: 'mob-123', mobName: 'Goblin' }}
            showHeader={true}
            onSaveSuccess={onSaveSuccess}
          />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Goblin Rig & Model Inspector')).toBeDefined();
    });

    const saveButtons = screen.getAllByRole('button', { name: /Save Rig Coordinates/i });
    expect(saveButtons.length).toBeGreaterThan(0);
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalled();
    });
  });

  it('switches animation states smoothly', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <ModularRigEditor target={{ type: 'character' }} showHeader={false} />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('head')).toBeDefined();
    });

    const attackButton = await screen.findByRole('button', { name: /^attack$/i });
    fireEvent.click(attackButton);

    await waitFor(() => {
      expect(attackButton.className).toContain('bg-slate-900');
    });
  });
});
