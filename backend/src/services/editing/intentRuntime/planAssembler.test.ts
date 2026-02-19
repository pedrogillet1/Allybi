import { describe, expect, test } from "@jest/globals";
import { substituteSlots } from "./planAssembler";

describe("substituteSlots", () => {
  test("direct $ref replaces with filled value", () => {
    const result = substituteSlots(
      { targets: "$target", styleName: "$style" },
      { target: "docx:p:1", style: "Heading 1" },
    );
    expect(result).toEqual({ targets: "docx:p:1", styleName: "Heading 1" });
  });

  test("array containing $ref items resolves each element", () => {
    const result = substituteSlots(
      { targetIds: ["$targets"] },
      { targets: "docx:p:1" },
    );
    expect(result).toEqual({ targetIds: ["docx:p:1"] });
  });

  test("array with multiple $ref items resolves all", () => {
    const result = substituteSlots(
      { items: ["$a", "$b"] },
      { a: "first", b: "second" },
    );
    expect(result).toEqual({ items: ["first", "second"] });
  });

  test("embedded $slotName in string is interpolated", () => {
    const result = substituteSlots(
      { styleName: "Heading $level" },
      { level: 2 },
    );
    expect(result).toEqual({ styleName: "Heading 2" });
  });

  test("multiple embedded $refs in one string", () => {
    const result = substituteSlots(
      { label: "$prefix $level $suffix" },
      { prefix: "Title", level: 3, suffix: "bold" },
    );
    expect(result).toEqual({ label: "Title 3 bold" });
  });

  test("missing slot resolves to null for direct ref", () => {
    const result = substituteSlots({ targets: "$missing" }, {});
    expect(result).toEqual({ targets: null });
  });

  test("missing slot in embedded string resolves to empty", () => {
    const result = substituteSlots({ styleName: "Heading $level" }, {});
    expect(result).toEqual({ styleName: "Heading " });
  });

  test("nested object slots are substituted recursively", () => {
    const result = substituteSlots({ outer: { inner: "$val" } }, { val: 42 });
    expect(result).toEqual({ outer: { inner: 42 } });
  });

  test("non-slot strings pass through unchanged", () => {
    const result = substituteSlots(
      { op: "DOCX_LIST_REMOVE", plain: "hello" },
      { target: "docx:p:1" },
    );
    expect(result).toEqual({ op: "DOCX_LIST_REMOVE", plain: "hello" });
  });

  test("numeric and boolean values pass through unchanged", () => {
    const result = substituteSlots({ count: 5, flag: true }, {});
    expect(result).toEqual({ count: 5, flag: true });
  });
});
