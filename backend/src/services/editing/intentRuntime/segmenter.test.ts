import { describe, expect, test } from "@jest/globals";
import { segmentMessage } from "./segmenter";

describe("intentRuntime segmenter weak connectors", () => {
  test("does not split formatting phrase joined by bare and", () => {
    const segments = segmentMessage(
      "make the selected text bold and italic",
      "en",
    );
    expect(segments).toHaveLength(1);
  });

  test("splits independent commands joined by bare and", () => {
    const segments = segmentMessage(
      "set A1 to 1 and sort B1:B20 by column B",
      "en",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0].text.toLowerCase()).toContain("set a1 to 1");
    expect(segments[1].text.toLowerCase()).toContain("sort b1:b20");
  });

  test("splits strong connector and then", () => {
    const segments = segmentMessage(
      "set A1 to 1 and then apply bold to B1",
      "en",
    );
    expect(segments).toHaveLength(2);
  });

  test("does not split formatting phrase joined by bare e", () => {
    const segments = segmentMessage(
      "deixe o texto selecionado em negrito e itálico",
      "pt",
    );
    expect(segments).toHaveLength(1);
  });

  test("splits independent commands joined by bare e", () => {
    const segments = segmentMessage(
      "defina A1 para 1 e ordene B1:B20 pela coluna B",
      "pt",
    );
    expect(segments).toHaveLength(2);
    expect(segments[0].text.toLowerCase()).toContain("defina a1 para 1");
    expect(segments[1].text.toLowerCase()).toContain("ordene b1:b20");
  });
});
