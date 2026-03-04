import {
  checkBudget,
  recordUsage,
  resetBudgets,
} from "./tokenBudgetLimiter.service";

// Mock the bank loader to return our test limits
jest.mock("../../core/banks/bankLoader.service", () => ({
  getOptionalBank: (id: string) => {
    if (id === "token_rate_limits") {
      return {
        limits: {
          perUserPerHour: { inputTokens: 1000, outputTokens: 500, costUsd: 0.10 },
          perUserPerDay: { inputTokens: 5000, outputTokens: 2000, costUsd: 0.50 },
        },
      };
    }
    return null;
  },
}));

describe("TokenBudgetLimiter", () => {
  beforeEach(() => {
    resetBudgets();
  });

  it("should allow requests within budget", () => {
    const result = checkBudget("user1", 100);
    expect(result.allowed).toBe(true);
    expect(result.remaining.inputTokens).toBeGreaterThan(0);
  });

  it("should reject when hourly input token limit exceeded", () => {
    recordUsage("user1", 900, 0, 0);
    const result = checkBudget("user1", 200); // 900 + 200 > 1000
    expect(result.allowed).toBe(false);
    expect(result.window).toBe("hourly");
  });

  it("should reject when hourly cost limit exceeded", () => {
    recordUsage("user1", 100, 100, 0.11); // cost exceeds 0.10
    const result = checkBudget("user1", 10);
    expect(result.allowed).toBe(false);
    expect(result.window).toBe("hourly");
  });

  it("should track usage across multiple calls", () => {
    recordUsage("user1", 200, 100, 0.01);
    recordUsage("user1", 300, 100, 0.02);
    const result = checkBudget("user1", 100);
    expect(result.allowed).toBe(true);
    expect(result.remaining.inputTokens).toBeLessThan(1000);
  });

  it("should isolate users", () => {
    recordUsage("user1", 900, 0, 0);
    const result1 = checkBudget("user1", 200);
    const result2 = checkBudget("user2", 200);
    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(true);
  });

  it("should reset cleanly", () => {
    recordUsage("user1", 900, 0, 0);
    resetBudgets();
    const result = checkBudget("user1", 100);
    expect(result.allowed).toBe(true);
  });
});
