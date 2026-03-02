import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../core/banks/bankLoader.service";
import { SpreadsheetEngineService } from "./spreadsheetEngine.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("SpreadsheetEngineService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
  });

  test("injects python_sandbox_policy hint into execute options", async () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "python_sandbox_policy") {
        return {
          _meta: { id: "python_sandbox_policy", version: "1.0.0" },
          config: { enabled: true, enforcementMode: "strict" },
          rules: [
            {
              category: "imports",
              enforcement: "allow",
              module: "numpy",
            },
            {
              category: "imports",
              enforcement: "block",
              module: "subprocess",
            },
          ],
        } as any;
      }
      return null as any;
    });

    const execute = jest.fn(async (req: any) => ({
      status: "ok",
      workbook: { spreadsheet_id: req.spreadsheetId },
      applied_ops: [],
      artifacts: {},
      answer_context: {},
      proof: {
        engine_version: "1",
        provider: "test",
        timings_ms: 1,
        trace_id: "tr_1",
      },
      warnings: [],
    }));
    const insight = jest.fn(async () => ({
      status: "ok",
      answer_context: {},
      artifacts: {},
      proof: {},
      warnings: [],
    }));

    const service = new SpreadsheetEngineService({
      mode: "shadow",
      client: { execute, insight } as any,
    });

    await service.execute({
      requestId: "req_1",
      documentId: "doc_1",
      userId: "user_1",
      correlationId: "corr_1",
      spreadsheetId: "sheet_1",
      ops: [{ kind: "set_values" }],
      options: { source: "test" },
    });

    const call = execute.mock.calls[0]?.[0] as any;
    expect(call.options.source).toBe("test");
    expect(call.options.sandboxPolicy.policyId).toBe("python_sandbox_policy");
    expect(call.options.sandboxPolicy.imports.allowed).toContain("numpy");
    expect(call.options.sandboxPolicy.imports.blocked).toContain("subprocess");
  });
});

