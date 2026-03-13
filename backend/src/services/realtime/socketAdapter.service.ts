import { createAdapter } from "@socket.io/redis-adapter";
import type { Server as SocketIOServer } from "socket.io";
import Redis from "ioredis";
import { shouldAttachSocketRedisAdapter } from "../../config/runtimeMode";

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

function buildRedisClient(): Redis {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) {
    throw new Error("REDIS_URL is required for the Socket.IO Redis adapter");
  }

  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function configureSocketRedisAdapter(
  io: SocketIOServer,
): Promise<void> {
  if (!shouldAttachSocketRedisAdapter()) return;

  pubClient = buildRedisClient();
  subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
}

export async function closeSocketRedisAdapter(): Promise<void> {
  const clients = [pubClient, subClient].filter(Boolean) as Redis[];
  pubClient = null;
  subClient = null;
  await Promise.all(
    clients.map((client) => client.quit().catch(() => client.disconnect())),
  );
}
