/**
 * The clock the weather runs on (ticket 132). The server says when the clock started and what its own time was when it
 * wrote the message, so this works out how far the two computers' clocks differ, once, and reads the weather clock from the
 * local clock after that. A client that joins late or reconnects gets the same facts, so it shows the same weather.
 */
export class SurfaceClock {
  private readonly startedAt: number;
  private readonly offset: number;

  /** `startedAt` and `serverNow` are server times (ms since epoch); `clientNow` is the local time when the message arrived. */
  constructor(startedAt: number, serverNow: number, clientNow: number = Date.now()) {
    this.startedAt = startedAt;
    this.offset = serverNow - clientNow;
  }

  /** Seconds on the weather clock at a local time (never before the start). */
  public seconds(clientNow: number = Date.now()): number {
    return Math.max(0, (clientNow + this.offset - this.startedAt) / 1000);
  }
}
