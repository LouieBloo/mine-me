import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PerformanceOverlay, setPerformanceOverlayOpen } from './PerformanceOverlay';
import { miningProfiler } from '../MiningGrid/utils/MiningProfiler';
import { notificationService } from '../../../../services/notificationService';

/** Runs a few frames and ends the report period so the profiler publishes stats. */
const publishReport = () => {
  act(() => {
    let t = 1000;
    miningProfiler.reset(t);
    for (let i = 0; i < 5; i++) {
      miningProfiler.beginFrame(t);
      miningProfiler.startSection('Lighting Engine', t);
      miningProfiler.endFrame(t + 4);
      t += 17;
    }
    miningProfiler.recordEvent('Server Tick Handling', 2);
    miningProfiler.setGauge('Display objects', 36000);
    miningProfiler.beginFrame(t);
    miningProfiler.endFrame(t + 1200);
  });
};

describe('PerformanceOverlay', () => {
  beforeEach(() => {
    miningProfiler.setEnabled(false);
    miningProfiler.reset();
  });
  afterEach(() => {
    setPerformanceOverlayOpen(false);
    vi.restoreAllMocks();
  });

  it('is hidden until F3 is pressed, then toggles with F3', () => {
    render(<PerformanceOverlay />);
    expect(screen.queryByTestId('performance-overlay')).toBeNull();
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.getByTestId('performance-overlay')).toBeInTheDocument();
    expect(miningProfiler.enabled).toBe(true);
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.queryByTestId('performance-overlay')).toBeNull();
    expect(miningProfiler.enabled).toBe(false);
  });

  it('keeps the console quiet while open and remembers the choice', () => {
    render(<PerformanceOverlay />);
    fireEvent.keyDown(window, { key: 'F3' });
    expect(miningProfiler.logToConsole).toBe(false);
    expect(window.localStorage.getItem('miningProfiler')).toBe('1');
    fireEvent.click(screen.getByText('Close'));
    expect(window.localStorage.getItem('miningProfiler')).toBe('0');
    expect(miningProfiler.logToConsole).toBe(true);
  });

  it('shows the verdict, sections, events, scene counts and server numbers once a report arrives', () => {
    render(<PerformanceOverlay />);
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.getByText(/Collecting numbers/)).toBeInTheDocument();
    miningProfiler.setServerPerf({
      windowTicks: 60, budgetMs: 33.33, tickMs: { avg: 31, p95: 36, max: 50 }, loadPercent: 93, loopGapMs: { avg: 33, max: 40 },
      steps: [{ name: 'fluids', avgMs: 20, maxMs: 30 }], droppedTicks: 2, counts: { mobs: 7 }, payloadBytes: 2048,
    });
    publishReport();
    expect(screen.getByTestId('performance-verdict')).toHaveTextContent('The server is the bottleneck');
    expect(screen.getByText('Lighting Engine')).toBeInTheDocument();
    expect(screen.getByText('Server Tick Handling')).toBeInTheDocument();
    expect(screen.getByText('36,000')).toBeInTheDocument();
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getAllByText(/fluids/).length).toBeGreaterThan(0);
  });

  it('copies the report as JSON and says so, and surfaces a blocked clipboard as an error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const success = vi.spyOn(notificationService, 'success').mockImplementation(() => {});
    const error = vi.spyOn(notificationService, 'error').mockImplementation(() => {});
    render(<PerformanceOverlay />);
    fireEvent.keyDown(window, { key: 'F3' });
    expect(screen.getByText('Copy report')).toBeDisabled(); // nothing to copy yet
    publishReport();

    await act(async () => { fireEvent.click(screen.getByText('Copy report')); });
    const copied = JSON.parse(writeText.mock.calls[0][0]);
    expect(copied).toMatchObject({ environment: { blockScale: 3 }, verdict: { where: expect.any(String) }, stats: { gauges: { 'Display objects': 36000 } } });
    expect(success).toHaveBeenCalled();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => { fireEvent.click(screen.getByText('Copy report')); });
    expect(error).toHaveBeenCalledWith('Could not copy the report', 'denied');
  });
});
