import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ExtractorPreview, { drawExtractorPreview } from './ExtractorPreview';
import type { ExtractorPreviewSettings } from './previewScene';

const settings: ExtractorPreviewSettings = { width: 12, height: 9, shaftWidth: 3, landingSeconds: 3, buildSecondsPerSegment: 1, beltSpeed: 6, beltItemSpacing: 1.5, unloadItemsPerSecond: 4 };

describe('ExtractorPreview', () => {
  afterEach(cleanup);

  it('draws sky, ground and the machine, and items once the belt is dug', () => {
    const ctx = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '', beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() };
    drawExtractorPreview(ctx, settings, 0.5);
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(ctx.arc).not.toHaveBeenCalled();
    drawExtractorPreview(ctx, settings, 3 + 8 + 3);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('renders a canvas with a restart button and says how long a run is', () => {
    render(<ExtractorPreview settings={settings} />);
    expect(screen.getByLabelText('Extractor preview')).toBeInTheDocument();
    expect(screen.getByText(/Repeats every 16s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByLabelText('Extractor preview')).toBeInTheDocument();
  });
});
