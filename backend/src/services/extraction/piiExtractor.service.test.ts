import { describe, expect, test } from "@jest/globals";
import PiiExtractorService from "./piiExtractor.service";

// ---------------------------------------------------------------------------
// Helper: create service with no filesystem banks (all banks null).
// We then inject mock bank data via `as any` to test pure logic.
// ---------------------------------------------------------------------------

const noopLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
} as any;

function makeService(): PiiExtractorService {
  return new PiiExtractorService({
    logger: noopLogger,
    banksPath: "/nonexistent-path-for-testing",
  });
}

function withValidationBank(
  svc: PiiExtractorService,
  validators: Record<string, any>,
): PiiExtractorService {
  (svc as any).validationBank = {
    _meta: { id: "pii_validation", version: "1.0.0" },
    validators,
  };
  return svc;
}

function withNormalizationBank(
  svc: PiiExtractorService,
  normalizers: Record<string, any>,
): PiiExtractorService {
  (svc as any).normalizationBank = {
    _meta: { id: "pii_normalization", version: "1.0.0" },
    normalizers,
  };
  return svc;
}

function withPatternsBank(
  svc: PiiExtractorService,
  patterns: Record<string, any>,
): PiiExtractorService {
  (svc as any).patternsBank = {
    _meta: { id: "pii_patterns", version: "1.0.0" },
    patterns,
  };
  // Compile the patterns so `extract` can use them
  (svc as any).compilePatterns();
  return svc;
}

function withFieldLabelsBank(
  svc: PiiExtractorService,
  fields: Record<string, any>,
): PiiExtractorService {
  (svc as any).fieldLabelsBank = {
    _meta: { id: "pii_field_labels", version: "1.0.0" },
    fields,
  };
  (svc as any).compileLabels();
  return svc;
}

// ===========================================================================
// CPF VALIDATION (mod 11)
// ===========================================================================

describe("PiiExtractorService — CPF validation", () => {
  const svc = withValidationBank(makeService(), {
    cpf: { checksum: "cpf_mod11", minLength: 11, maxLength: 14 },
  });

  test("valid CPF passes checksum", () => {
    // Known valid CPF: 529.982.247-25
    expect(svc.validate("cpf", "52998224725")).toEqual({ valid: true });
  });

  test("valid CPF with formatting passes", () => {
    // The validate method strips non-digits before checksum
    expect(svc.validate("cpf", "529.982.247-25")).toEqual({ valid: true });
  });

  test("all-same-digit CPF is rejected", () => {
    expect(svc.validate("cpf", "11111111111")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("another all-same-digit CPF (00000000000) is rejected", () => {
    expect(svc.validate("cpf", "00000000000")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("wrong length CPF is rejected by minLength", () => {
    expect(svc.validate("cpf", "1234")).toEqual({
      valid: false,
      reason: "Too short",
    });
  });

  test("CPF exceeding maxLength is rejected", () => {
    expect(svc.validate("cpf", "123456789012345")).toEqual({
      valid: false,
      reason: "Too long",
    });
  });

  test("CPF with wrong checksum digit fails", () => {
    // Flip last digit of a valid CPF
    expect(svc.validate("cpf", "52998224726")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("CPF with wrong first check digit fails", () => {
    // 529.982.247-25 is valid; change digit at pos 9 (first check digit)
    expect(svc.validate("cpf", "52998224625")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("second known valid CPF (453.178.287-91)", () => {
    // 453.178.287-91 — verified via mod11 algorithm
    expect(svc.validate("cpf", "45317828791")).toEqual({ valid: true });
  });
});

// ===========================================================================
// CNPJ VALIDATION (mod 11)
// ===========================================================================

describe("PiiExtractorService — CNPJ validation", () => {
  const svc = withValidationBank(makeService(), {
    cnpj: { checksum: "cnpj_mod11", minLength: 14, maxLength: 18 },
  });

  test("valid CNPJ passes checksum", () => {
    // 11.222.333/0001-81
    expect(svc.validate("cnpj", "11222333000181")).toEqual({ valid: true });
  });

  test("valid CNPJ with formatting passes", () => {
    expect(svc.validate("cnpj", "11.222.333/0001-81")).toEqual({ valid: true });
  });

  test("all-same-digit CNPJ is rejected", () => {
    expect(svc.validate("cnpj", "11111111111111")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("wrong length CNPJ is rejected by minLength", () => {
    expect(svc.validate("cnpj", "1234567890")).toEqual({
      valid: false,
      reason: "Too short",
    });
  });

  test("CNPJ exceeding maxLength is rejected", () => {
    expect(svc.validate("cnpj", "1234567890123456789")).toEqual({
      valid: false,
      reason: "Too long",
    });
  });

  test("CNPJ with wrong check digit fails", () => {
    expect(svc.validate("cnpj", "11222333000182")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("second known valid CNPJ", () => {
    // 11.444.777/0001-61
    expect(svc.validate("cnpj", "11444777000161")).toEqual({ valid: true });
  });
});

// ===========================================================================
// LUHN VALIDATION (credit cards)
// ===========================================================================

describe("PiiExtractorService — Luhn validation", () => {
  const svc = withValidationBank(makeService(), {
    credit_card: { checksum: "luhn", minLength: 13, maxLength: 19 },
  });

  test("valid Visa number passes Luhn", () => {
    expect(svc.validate("credit_card", "4539578763621486")).toEqual({
      valid: true,
    });
  });

  test("valid Visa with spaces passes Luhn", () => {
    expect(svc.validate("credit_card", "4539 5787 6362 1486")).toEqual({
      valid: true,
    });
  });

  test("valid Visa with dashes passes Luhn", () => {
    expect(svc.validate("credit_card", "4539-5787-6362-1486")).toEqual({
      valid: true,
    });
  });

  test("invalid card number fails Luhn", () => {
    expect(svc.validate("credit_card", "1234567890123456")).toEqual({
      valid: false,
      reason: "Checksum failed",
    });
  });

  test("known Luhn-valid test number (4111 1111 1111 1111)", () => {
    expect(svc.validate("credit_card", "4111111111111111")).toEqual({
      valid: true,
    });
  });

  test("known Luhn-valid MasterCard test (5500 0000 0000 0004)", () => {
    expect(svc.validate("credit_card", "5500000000000004")).toEqual({
      valid: true,
    });
  });

  test("too-short card number rejected by minLength", () => {
    expect(svc.validate("credit_card", "1234")).toEqual({
      valid: false,
      reason: "Too short",
    });
  });

  test("too-long card number rejected by maxLength", () => {
    expect(svc.validate("credit_card", "12345678901234567890")).toEqual({
      valid: false,
      reason: "Too long",
    });
  });
});

// ===========================================================================
// VALIDATE — no validator defined
// ===========================================================================

describe("PiiExtractorService — validate without validators", () => {
  const svc = makeService();

  test("unknown field type returns valid when no bank loaded", () => {
    expect(svc.validate("unknown_type", "anything")).toEqual({ valid: true });
  });

  test("known field type returns valid when no validation bank loaded", () => {
    expect(svc.validate("cpf", "00000000000")).toEqual({ valid: true });
  });
});

// ===========================================================================
// VALIDATE — pattern-based validation
// ===========================================================================

describe("PiiExtractorService — pattern validator", () => {
  const svc = withValidationBank(makeService(), {
    zip_us: { pattern: "^\\d{5}(-\\d{4})?$", minLength: 5, maxLength: 10 },
  });

  test("valid US zip passes pattern", () => {
    expect(svc.validate("zip_us", "90210")).toEqual({ valid: true });
  });

  test("valid US zip+4 passes pattern", () => {
    expect(svc.validate("zip_us", "90210-1234")).toEqual({ valid: true });
  });

  test("invalid US zip fails pattern", () => {
    expect(svc.validate("zip_us", "ABCDE")).toEqual({
      valid: false,
      reason: "Pattern mismatch",
    });
  });
});

// ===========================================================================
// NORMALIZATION
// ===========================================================================

describe("PiiExtractorService — normalize", () => {
  test("returns original value when no normalizer defined", () => {
    const svc = makeService();
    expect(svc.normalize("unknown_field", "test value")).toBe("test value");
  });

  test("returns original value when no normalization bank loaded", () => {
    const svc = makeService();
    expect(svc.normalize("cpf", "529.982.247-25")).toBe("529.982.247-25");
  });

  test("strips specified characters", () => {
    const svc = withNormalizationBank(makeService(), {
      cpf: { removeChars: [".", "-", " "] },
    });
    expect(svc.normalize("cpf", "529.982.247-25")).toBe("52998224725");
  });

  test("applies format mask to digit-only value", () => {
    const svc = withNormalizationBank(makeService(), {
      cpf: { format: "###.###.###-##" },
    });
    expect(svc.normalize("cpf", "52998224725")).toBe("529.982.247-25");
  });

  test("strips chars then applies format", () => {
    const svc = withNormalizationBank(makeService(), {
      cpf: { removeChars: [".", "-", " "], format: "###.###.###-##" },
    });
    expect(svc.normalize("cpf", "529 982 247 25")).toBe("529.982.247-25");
  });

  test("format does not apply to non-digit values", () => {
    const svc = withNormalizationBank(makeService(), {
      name: { format: "###" },
    });
    // The format only applies when the value is all digits after removeChars
    expect(svc.normalize("name", "abc")).toBe("abc");
  });

  test("CNPJ formatting", () => {
    const svc = withNormalizationBank(makeService(), {
      cnpj: {
        removeChars: [".", "/", "-"],
        format: "##.###.###/####-##",
      },
    });
    expect(svc.normalize("cnpj", "11222333000181")).toBe("11.222.333/0001-81");
  });
});

// ===========================================================================
// EXTRACT — no banks loaded
// ===========================================================================

describe("PiiExtractorService — extract without banks", () => {
  const svc = makeService();

  test("returns empty fields and zero confidence", () => {
    const result = svc.extract("My CPF is 529.982.247-25");
    expect(result).toEqual({ fields: [], confidence: 0 });
  });

  test("extractField also returns empty", () => {
    const result = svc.extractField("My CPF is 529.982.247-25", "cpf");
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// EXTRACT — with mock banks (end-to-end in-memory)
// ===========================================================================

describe("PiiExtractorService — extract with mock banks", () => {
  function makeFullService() {
    const svc = makeService();
    withPatternsBank(svc, {
      cpf: {
        regex: ["\\b\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\b"],
        confidence: 0.8,
        requireLabelNearby: false,
      },
      email: {
        regex: ["[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"],
        confidence: 0.9,
        requireLabelNearby: false,
      },
    });
    withValidationBank(svc, {
      cpf: { checksum: "cpf_mod11", minLength: 11, maxLength: 14 },
    });
    withNormalizationBank(svc, {
      cpf: { removeChars: [".", "-"] },
    });
    return svc;
  }

  test("extracts valid CPF from text", () => {
    const svc = makeFullService();
    const result = svc.extract("Meu CPF e 529.982.247-25, obrigado.");
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].fieldType).toBe("cpf");
    expect(result.fields[0].value).toBe("529.982.247-25");
    expect(result.fields[0].validated).toBe(true);
    expect(result.fields[0].normalizedValue).toBe("52998224725");
    expect(result.confidence).toBeGreaterThan(0);
  });

  test("extracts email from text", () => {
    const svc = makeFullService();
    const result = svc.extract("Contact me at john@example.com please");
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].fieldType).toBe("email");
    expect(result.fields[0].value).toBe("john@example.com");
    // No validator for email, so validated should be undefined
    expect(result.fields[0].validated).toBeUndefined();
  });

  test("extracts multiple fields from same text", () => {
    const svc = makeFullService();
    const result = svc.extract(
      "CPF: 529.982.247-25, email: john@example.com",
    );
    expect(result.fields.length).toBe(2);
    const types = result.fields.map((f) => f.fieldType).sort();
    expect(types).toEqual(["cpf", "email"]);
  });

  test("invalid CPF reduces confidence but still extracted", () => {
    const svc = makeFullService();
    const result = svc.extract("CPF: 111.111.111-11");
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].validated).toBe(false);
    // Confidence should be reduced (0.8 * 0.7 = 0.56)
    expect(result.fields[0].confidence).toBeCloseTo(0.56, 2);
  });

  test("returns empty when no patterns match", () => {
    const svc = makeFullService();
    const result = svc.extract("No PII here at all.");
    expect(result.fields).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  test("extractField filters by field type", () => {
    const svc = makeFullService();
    const cpfFields = svc.extractField(
      "CPF: 529.982.247-25, email: john@example.com",
      "cpf",
    );
    expect(cpfFields.length).toBe(1);
    expect(cpfFields[0].fieldType).toBe("cpf");
  });
});

// ===========================================================================
// EXTRACT — label-nearby gating
// ===========================================================================

describe("PiiExtractorService — label-nearby gating", () => {
  function makeLabelService() {
    const svc = makeService();
    withPatternsBank(svc, {
      phone: {
        regex: ["\\b\\d{3}[-.]\\d{3}[-.]\\d{4}\\b"],
        confidence: 0.6,
        requireLabelNearby: true,
        labelWindowChars: 30,
      },
    });
    withFieldLabelsBank(svc, {
      phone: {
        en: ["phone", "telephone", "tel"],
        pt: ["telefone", "fone"],
        es: ["telefono"],
      },
    });
    return svc;
  }

  test("extracts field when label is within window", () => {
    const svc = makeLabelService();
    const result = svc.extract("My phone number is 555.123.4567");
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].labelFound).toBe("phone");
    // Confidence boosted by 0.15 (0.6 + 0.15 = 0.75)
    expect(result.fields[0].confidence).toBeCloseTo(0.75, 2);
  });

  test("skips field when label is too far away", () => {
    const svc = makeLabelService();
    const result = svc.extract(
      "phone is on the table in the room............................................555.123.4567",
    );
    // The label "phone" is more than 30 chars away from the number
    expect(result.fields.length).toBe(0);
  });

  test("skips field when no label present at all", () => {
    const svc = makeLabelService();
    const result = svc.extract("call me at 555.123.4567");
    // "call me at" does not contain any of the registered labels
    expect(result.fields.length).toBe(0);
  });

  test("multilingual labels work (pt)", () => {
    const svc = makeLabelService();
    const result = svc.extract("Meu telefone: 555.123.4567");
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].labelFound).toBe("telefone");
  });
});

// ===========================================================================
// DEDUPLICATION
// ===========================================================================

describe("PiiExtractorService — deduplication", () => {
  test("overlapping fields keep highest confidence", () => {
    // Two patterns matching the same text region — only higher conf survives
    const svc = makeService();
    withPatternsBank(svc, {
      id_number: {
        regex: ["\\b\\d{11}\\b"],
        confidence: 0.5,
        requireLabelNearby: false,
      },
      cpf: {
        regex: ["\\b\\d{11}\\b"],
        confidence: 0.8,
        requireLabelNearby: false,
      },
    });

    const result = svc.extract("Numero: 52998224725 fim");
    // Both patterns match the same range, dedup should keep cpf (0.8 > 0.5)
    expect(result.fields.length).toBe(1);
    expect(result.fields[0].fieldType).toBe("cpf");
    expect(result.fields[0].confidence).toBe(0.8);
  });

  test("non-overlapping fields are all kept", () => {
    const svc = makeService();
    withPatternsBank(svc, {
      num_a: {
        regex: ["\\bAAAA\\b"],
        confidence: 0.9,
        requireLabelNearby: false,
      },
      num_b: {
        regex: ["\\bBBBB\\b"],
        confidence: 0.7,
        requireLabelNearby: false,
      },
    });

    const result = svc.extract("AAAA and BBBB");
    expect(result.fields.length).toBe(2);
  });
});

// ===========================================================================
// getSupportedFieldTypes / getFieldLabels
// ===========================================================================

describe("PiiExtractorService — getSupportedFieldTypes", () => {
  test("returns empty array when no banks loaded", () => {
    const svc = makeService();
    expect(svc.getSupportedFieldTypes()).toEqual([]);
  });

  test("returns field types from patterns bank", () => {
    const svc = makeService();
    withPatternsBank(svc, {
      cpf: { regex: [], confidence: 0.8 },
      email: { regex: [], confidence: 0.9 },
    });
    const types = svc.getSupportedFieldTypes().sort();
    expect(types).toEqual(["cpf", "email"]);
  });
});

describe("PiiExtractorService — getFieldLabels", () => {
  test("returns empty when no bank loaded", () => {
    const svc = makeService();
    expect(svc.getFieldLabels("cpf")).toEqual([]);
  });

  test("returns labels for the requested language", () => {
    const svc = makeService();
    withFieldLabelsBank(svc, {
      cpf: {
        en: ["CPF", "tax id"],
        pt: ["CPF", "cadastro"],
        es: ["CPF"],
      },
    });
    expect(svc.getFieldLabels("cpf", "pt")).toEqual(["CPF", "cadastro"]);
  });

  test("defaults to English labels", () => {
    const svc = makeService();
    withFieldLabelsBank(svc, {
      cpf: { en: ["CPF", "tax id"], pt: [], es: [] },
    });
    expect(svc.getFieldLabels("cpf")).toEqual(["CPF", "tax id"]);
  });

  test("returns empty for unknown field type", () => {
    const svc = makeService();
    withFieldLabelsBank(svc, {
      cpf: { en: ["CPF"], pt: [], es: [] },
    });
    expect(svc.getFieldLabels("passport")).toEqual([]);
  });
});

// ===========================================================================
// OVERALL CONFIDENCE CALCULATION
// ===========================================================================

describe("PiiExtractorService — overall confidence", () => {
  test("overall confidence is average of all field confidences", () => {
    const svc = makeService();
    withPatternsBank(svc, {
      type_a: {
        regex: ["\\bAAA\\b"],
        confidence: 0.8,
        requireLabelNearby: false,
      },
      type_b: {
        regex: ["\\bBBB\\b"],
        confidence: 0.6,
        requireLabelNearby: false,
      },
    });

    const result = svc.extract("AAA and BBB");
    // (0.8 + 0.6) / 2 = 0.7
    expect(result.confidence).toBeCloseTo(0.7, 2);
  });
});

// ===========================================================================
// LANGUAGE PASSTHROUGH
// ===========================================================================

describe("PiiExtractorService — language passthrough", () => {
  test("extract passes through language parameter", () => {
    const svc = makeService();
    withPatternsBank(svc, {
      cpf: {
        regex: ["\\b\\d{11}\\b"],
        confidence: 0.8,
        requireLabelNearby: false,
      },
    });
    const result = svc.extract("52998224725", "pt");
    expect(result.language).toBe("pt");
  });

  test("extract language is undefined when not passed", () => {
    const svc = makeService();
    const result = svc.extract("hello");
    expect(result.language).toBeUndefined();
  });
});
