import { Queue } from "bullmq";
import { createRequire } from "module";

// Get Redis connection from env
const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/pg/Desktop/koda-webapp/backend/.env" });

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;

let connection;
if (UPSTASH_REDIS_REST_URL) {
  // Upstash uses REST, BullMQ needs direct Redis — check if there's an ioredis URL
  const ioUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
  if (ioUrl) {
    console.log("Using Redis URL:", ioUrl.replace(/:[^:@]+@/, ":***@"));
    connection = { url: ioUrl };
  } else {
    console.log("Using Upstash REST — checking for direct connection params");
    connection = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD };
  }
} else {
  connection = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD };
}

console.log("Redis connection:", JSON.stringify({ host: connection.host, port: connection.port, hasPassword: !!connection.password, hasUrl: !!connection.url }));

const prefix = process.env.NODE_ENV === "production" ? "" : "dev-";
const queueName = `${prefix}document-processing`;
console.log("Queue name:", queueName);
const queue = new Queue(queueName, { connection });

const jobData = {
  documentId: "f31c4b09-0bd6-4d22-963e-8759f4c4c1a0",
  userId: "17a07d7e-1db5-4a0b-b0e7-5f8672a05890",
  filename: "exames-5.pdf",
  mimeType: "application/pdf",
  encryptedFilename: "users/17a07d7e-1db5-4a0b-b0e7-5f8672a05890/docs/f31c4b09-0bd6-4d22-963e-8759f4c4c1a0/exames-5.pdf",
};

try {
  const job = await queue.add("process-document", jobData, {
    jobId: `doc-${jobData.documentId}-retry-${Date.now()}`,
    removeOnComplete: true,
    removeOnFail: false,
  });
  console.log("Job queued:", job.id, job.name);
} catch (err) {
  console.error("Failed to queue:", err.message);
}

await queue.close();
process.exit(0);
