import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  resolveEditErrorMessage,
  resolveEditorTargetRequiredMessage,
  resolveGenericChatFailureMessage,
  resolveRuntimeFallbackMessage,
} from "./chatMicrocopy.service";
import { getOptionalBank } from "../core/banks/bankLoader.service";

jest.mock("../core/banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("chatMicrocopy.service", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
  });

  it("resolves generic chat failures from processing_messages bank", () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "processing_messages") {
        return {
          config: { enabled: true },
          messages: {
            error: {
              en: ["Error variant 1", "Error variant 2"],
            },
          },
        } as any;
      }
      return null;
    });

    const out = resolveGenericChatFailureMessage("en", "seed-1");
    expect(["Error variant 1", "Error variant 2"]).toContain(out);
  });

  it("falls back to edit_error_catalog when processing bank is unavailable", () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "processing_messages") return null;
      if (id === "edit_error_catalog") {
        return {
          config: { enabled: true, fallbackLanguage: "en" },
          errors: {
            en: {
              GENERIC_EDIT_ERROR: "Catalog fallback message",
            },
          },
        } as any;
      }
      return null;
    });

    expect(resolveGenericChatFailureMessage("en", "seed-2")).toBe(
      "Catalog fallback message",
    );
  });

  it("resolves editor target required from edit_error_catalog", () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "edit_error_catalog") {
        return {
          config: { enabled: true, fallbackLanguage: "en" },
          errors: {
            en: { TARGET_NOT_RESOLVED: "Select exact target" },
          },
        } as any;
      }
      return null;
    });

    expect(resolveEditorTargetRequiredMessage("en")).toBe("Select exact target");
    expect(resolveEditErrorMessage("TARGET_NOT_RESOLVED", "en")).toBe(
      "Select exact target",
    );
  });

  it("uses timeout flavor for indexing fallback reason", () => {
    mockedGetOptionalBank.mockImplementation((id: string) => {
      if (id === "processing_messages") {
        return {
          config: { enabled: true },
          messages: {
            timeout: { en: ["Still processing"] },
            error: { en: ["Error fallback"] },
          },
        } as any;
      }
      return null;
    });

    expect(
      resolveRuntimeFallbackMessage({
        language: "en",
        reasonCode: "indexing_in_progress",
        seed: "seed-3",
      }),
    ).toBe("Still processing");
  });
});
