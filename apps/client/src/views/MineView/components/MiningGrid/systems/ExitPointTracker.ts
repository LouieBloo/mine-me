import { isOnEntrance } from '@mine-me/shared';

/**
 * Notices when the local player steps onto or off the extraction point, from their drawn position each frame, and reports
 * only the changes (a frame that changes nothing costs a comparison), so the page can show its prompt without re-rendering
 * sixty times a second.
 */
export class ExitPointTracker {
  private atExit = false;
  private readonly surfaceRow: number;
  private readonly onChange: (atExit: boolean) => void;

  constructor(surfaceRow: number, onChange: (atExit: boolean) => void) {
    this.surfaceRow = surfaceRow;
    this.onChange = onChange;
  }

  /** Call every frame with the player's position in blocks. */
  public update(x: number, y: number): void {
    const now = isOnEntrance(x, y, this.surfaceRow);
    if (now === this.atExit) return;
    this.atExit = now;
    this.onChange(now);
  }

  /** Forgets where the player was and says they are not at the exit (when a run ends). */
  public reset(): void {
    if (!this.atExit) return;
    this.atExit = false;
    this.onChange(false);
  }
}
