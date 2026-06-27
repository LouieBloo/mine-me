import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function initRedis(): Promise<RedisClientType> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = createClient({
    url: redisUrl,
  }) as RedisClientType;

  redisClient.on('error', (err) => {
    console.error('❌ Redis Client Error:', err);
  });

  await redisClient.connect();
  console.log('🔌 Redis connected successfully');
  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client has not been initialized. Call initRedis first.');
  }
  return redisClient;
}

export function resetRedisClientForTest(): void {
  redisClient = null;
}

