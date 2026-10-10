import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected = false;
  id = 'fake';
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; args: any[] }[] = [];
  /** Decides how the fake server answers an emit. */
  respond: (event: string, args: any[], ack: Handler) => void = (_e, _a, ack) => ack(null, { success: true });

  on(event: string, h: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]); return this; }
  once(event: string, h: Handler) {
    const wrapper: Handler = (...a) => { this.off(event, wrapper); h(...a); };
    return this.on(event, wrapper);
  }
  off(event: string, h?: Handler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((x) => x !== h));
    return this;
  }
  fire(event: string, ...args: any[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const h of [...(this.handlers.get(event) ?? [])]) h(...args);
  }
  timeout(_ms: number) {
    return { emit: (event: string, ...args: any[]) => this.emit(event, ...args) };
  }
  emit(event: string, ...rest: any[]) {
    const ack = rest.pop();
    this.emitted.push({ event, args: rest });
    this.respond(event, rest, ack);
    return this;
  }
  disconnect() { this.connected = false; }
}

let sockets: FakeSocket[];
const ioMock = vi.fn();

vi.mock('socket.io-client', () => ({ io: (...a: any[]) => ioMock(...a) }));

async function freshService() {
  vi.resetModules();
  return import('./socketService');
}

const count = (s: FakeSocket, event: string) => s.emitted.filter((e) => e.event === event).length;

describe('socketService', () => {
  beforeEach(() => {
    sockets = [];
    ioMock.mockReset();
    ioMock.mockImplementation(() => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    });
  });

  it('shares one in-flight connect between concurrent callers', async () => {
    const { socketService } = await freshService();
    const a = socketService.connect('t');
    const b = socketService.connect('t');
    expect(ioMock).toHaveBeenCalledTimes(1);
    sockets[0].fire('connect');
    await Promise.all([a, b]);
    expect(socketService.isConnected).toBe(true);
  });

  it('can retry connecting after a failed attempt', async () => {
    const { socketService } = await freshService();
    const first = socketService.connect('t');
    sockets[0].fire('connect_error', new Error('ECONNREFUSED'));
    await expect(first).rejects.toThrow('ECONNREFUSED');

    const second = socketService.connect('t');
    sockets[0].fire('connect');
    await second;
    expect(socketService.isConnected).toBe(true);
    expect(ioMock).toHaveBeenCalledTimes(1); // socket.io keeps retrying the same socket
  });

  it('drops the socket on an authentication error so a new token connects fresh', async () => {
    const { socketService } = await freshService();
    const first = socketService.connect('bad');
    sockets[0].fire('connect_error', new Error('Authentication error: Invalid or expired token'));
    await expect(first).rejects.toThrow('Authentication error');
    expect(socketService.instance).toBeNull();

    const second = socketService.connect('good');
    expect(ioMock).toHaveBeenCalledTimes(2);
    sockets[1].fire('connect');
    await second;
  });

  it('waits for the connection before emitting instead of failing', async () => {
    const { socketService } = await freshService();
    const connecting = socketService.connect('t');
    const selecting = socketService.selectCharacter('c1');
    await Promise.resolve();
    expect(count(sockets[0], 'select_character')).toBe(0);

    sockets[0].fire('connect');
    await connecting;
    await selecting;
    expect(count(sockets[0], 'select_character')).toBe(1);
  });

  it('rejects with a non-server error when it is not connected at all', async () => {
    const { socketService, SocketRequestError } = await freshService();
    const err = await socketService.sendGameEvent({ type: 'rest', days: 1 } as any).catch((e) => e);
    expect(err).toBeInstanceOf(SocketRequestError);
    expect(err.serverRejected).toBe(false);
  });

  it('selects a character once per connection and again after a reconnect', async () => {
    const { socketService } = await freshService();
    const connecting = socketService.connect('t');
    sockets[0].fire('connect');
    await connecting;

    await Promise.all([socketService.selectCharacter('c1'), socketService.selectCharacter('c1')]);
    await socketService.selectCharacter('c1');
    expect(count(sockets[0], 'select_character')).toBe(1);

    sockets[0].fire('disconnect');
    sockets[0].fire('connect'); // new server-side socket knows nothing
    await socketService.selectCharacter('c1');
    expect(count(sockets[0], 'select_character')).toBe(2);
  });

  it('leaves the previous city before joining another, and rejoins after a reconnect', async () => {
    const { socketService } = await freshService();
    const connecting = socketService.connect('t');
    sockets[0].fire('connect');
    await connecting;

    await socketService.joinCity('a', 'c1');
    await socketService.joinCity('a', 'c1');
    expect(count(sockets[0], 'join_city')).toBe(1);

    await socketService.joinCity('b', 'c1');
    expect(sockets[0].emitted.map((e) => e.event)).toEqual(['join_city', 'leave_city', 'join_city']);

    sockets[0].fire('disconnect');
    sockets[0].fire('connect');
    await socketService.joinCity('b', 'c1');
    expect(count(sockets[0], 'join_city')).toBe(3);
  });

  it('flags server rejections and ack timeouts differently', async () => {
    const { socketService } = await freshService();
    const connecting = socketService.connect('t');
    sockets[0].fire('connect');
    await connecting;

    sockets[0].respond = (_e, _a, ack) => ack(null, { error: 'Character not found or forbidden' });
    const rejected = await socketService.selectCharacter('c1').catch((e) => e);
    expect(rejected.serverRejected).toBe(true);
    expect(rejected.message).toBe('Character not found or forbidden');

    sockets[0].respond = (_e, _a, ack) => ack(new Error('operation has timed out'));
    const timedOut = await socketService.selectCharacter('c2').catch((e) => e);
    expect(timedOut.serverRejected).toBe(false);
  });

  it('rejects game events the server refuses', async () => {
    const { socketService } = await freshService();
    const connecting = socketService.connect('t');
    sockets[0].fire('connect');
    await connecting;
    sockets[0].respond = (_e, _a, ack) => ack(null, { success: false, error: 'No character selected' });
    await expect(socketService.sendGameEvent({ type: 'rest', days: 1 } as any)).rejects.toThrow('No character selected');
  });
});
