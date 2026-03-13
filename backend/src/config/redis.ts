import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";
import { config } from "./env";

let redisConnection: UpstashRedis | null = null;
let redisPubSubClient: Redis | null = null;

try {
  if (config.REDIS_URL) {
    console.log("🔗 Connecting to Redis using REDIS_URL...");
    redisPubSubClient = new Redis(config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    console.log("✅ Redis transport client initialized");
  }

  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    console.log("🔗 Connecting to Upstash Redis using REST API...");
    redisConnection = new UpstashRedis({
      url: config.UPSTASH_REDIS_REST_URL,
      token: config.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("✅ Upstash Redis REST client initialized");
  }
} catch (error) {
  console.warn(
    "⚠️  Redis initialization failed (continuing without Redis):",
    (error as Error).message,
  );
  redisConnection = null;
}

export { redisConnection };
export { redisPubSubClient };
export default redisConnection;
