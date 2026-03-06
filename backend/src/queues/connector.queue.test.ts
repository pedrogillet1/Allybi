import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockQueueAdd = jest.fn(async () => ({ id: "job-1" }));

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: (...args: any[]) => mockQueueAdd(...args),
    getWaitingCount: jest.fn(async () => 0),
    getActiveCount: jest.fn(async () => 0),
    getCompletedCount: jest.fn(async () => 0),
    getFailedCount: jest.fn(async () => 0),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(async () => {}),
  })),
}));

jest.mock("../config/env", () => ({
  config: {
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "",
  },
}));

jest.mock("../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { addConnectorSyncJob } from "./connector.queue";

describe("connector queue idempotency key", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses stable jobId within the same dedupe bucket", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    await addConnectorSyncJob({
      userId: "user-1",
      provider: "gmail",
      cursor: null,
      forceResync: false,
    });
    await addConnectorSyncJob({
      userId: "user-1",
      provider: "gmail",
      cursor: null,
      forceResync: false,
    });

    const firstJobId = mockQueueAdd.mock.calls[0]?.[2]?.jobId;
    const secondJobId = mockQueueAdd.mock.calls[1]?.[2]?.jobId;
    expect(firstJobId).toBe(secondJobId);
  });

  test("changes jobId between incremental and force resync in same bucket", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    await addConnectorSyncJob({
      userId: "user-1",
      provider: "gmail",
      cursor: null,
      forceResync: false,
    });
    await addConnectorSyncJob({
      userId: "user-1",
      provider: "gmail",
      cursor: null,
      forceResync: true,
    });

    const incrementalJobId = mockQueueAdd.mock.calls[0]?.[2]?.jobId;
    const forceJobId = mockQueueAdd.mock.calls[1]?.[2]?.jobId;
    expect(incrementalJobId).not.toBe(forceJobId);
  });
});

