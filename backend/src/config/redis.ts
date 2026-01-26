import { Redis } from '@upstash/redis';
import { config } from './env';

let redisConnection: Redis | null = null;

try {
  // Check if Upstash Redis REST credentials are available
  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    console.log('🔗 Connecting to Upstash Redis using REST API...');
    redisConnection = new Redis({
      url: config.UPSTASH_REDIS_REST_URL,
      token: config.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('✅ Upstash Redis REST client initialized');
  } else {
    console.warn('⚠️  Upstash Redis credentials not found in environment variables');
    console.warn('⚠️  Background job processing will be disabled');
    redisConnection = null;
  }
} catch (error) {
  console.warn('⚠️  Redis initialization failed (continuing without Redis):', (error as Error).message);
  redisConnection = null;
}

export { redisConnection };
export default redisConnection;
