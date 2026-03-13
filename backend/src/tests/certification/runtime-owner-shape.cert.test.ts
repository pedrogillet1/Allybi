import fs from "fs";
import path from "path";

describe("Certification: runtime owner shape", () => {
  test("orchestrator, executor, and enforcer keep strict owner boundaries", () => {
    const orchestratorSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
      ),
      "utf8",
    );
    const executorSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/modules/chat/runtime/ChatTurnExecutor.ts",
      ),
      "utf8",
    );
    const enforcerSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/services/core/enforcement/responseContractEnforcer.service.ts",
      ),
      "utf8",
    );

    expect(orchestratorSource).not.toContain("getBankLoaderInstance");
    expect(orchestratorSource).not.toContain("prisma");
    expect(executorSource).not.toContain("resolveGovernancePolicyBlock");
    expect(executorSource).not.toContain("new ConversationMemoryService(");
    expect(enforcerSource).not.toContain("blocked:");
    expect(enforcerSource).not.toContain("reasonCode:");
    expect(enforcerSource).not.toContain("resolveOperatorContract(ctx.operator)");
  });

  test("main owner files stay under the rewrite size caps", () => {
    const sizeCaps = [
      ["src/modules/chat/runtime/ChatRuntimeOrchestrator.ts", 425],
      ["src/modules/chat/runtime/ChatTurnExecutor.ts", 450],
      ["src/modules/chat/runtime/TurnFinalizationService.ts", 300],
      ["src/services/core/retrieval/v2/UserScopedRetrievalRuntime.service.ts", 300],
    ] as const;

    const failures = sizeCaps
      .map(([relativePath, maxLines]) => {
        const source = fs.readFileSync(
          path.resolve(process.cwd(), relativePath),
          "utf8",
        );
        const lines = source.split("\n").length;
        return lines > maxLines ? `${relativePath}:${lines}>${maxLines}` : null;
      })
      .filter(Boolean);

    expect(failures).toEqual([]);
  });

  test("old runtime owner files are removed", () => {
    const runtimeEntries = fs.readdirSync(
      path.resolve(process.cwd(), "src/modules/chat/runtime"),
    );
    expect(runtimeEntries).not.toContain("ChatRuntimeKernel.ts");
    expect(runtimeEntries).not.toContain("ChatTurnService.ts");
    expect(runtimeEntries).not.toContain("CentralizedChatRuntimeDelegate.ts");
  });
});
