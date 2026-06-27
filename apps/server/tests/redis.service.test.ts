import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initRedis, getRedisClient, resetRedisClientForTest } from '../src/services/redis.service';

vi.mock('redis', () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe('RedisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisClientForTest();
  });

  it('should initialize and connect to Redis', async () => {
    const client = await initRedis();
    expect(client).toBeDefined();
    expect(client.connect).toHaveBeenCalled();
  });

  it('should throw error when getRedisClient is called before initRedis', () => {
    expect(() => getRedisClient()).toThrow();
  });

  it('should retrieve client after initRedis', async () => {
    await initRedis();
    const client = getRedisClient();
    expect(client).toBeDefined();
  });
});
