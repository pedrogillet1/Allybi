import ChartShapeValidatorService from "./chartShapeValidator.service";

describe("ChartShapeValidatorService", () => {
  const range = {
    startColumnIndex: 0,
    endColumnIndexExclusive: 3,
    startRowIndex: 0,
    endRowIndexExclusive: 6,
  };

  const makeValidator = (rows: any[][]) => {
    const sheetsClient = {
      getValues: jest.fn().mockResolvedValue({ values: rows }),
    } as any;
    return new ChartShapeValidatorService(sheetsClient);
  };

  test("returns stacked plan when label + two numeric series exist", async () => {
    const svc = makeValidator([
      ["Month", "Revenue", "Cost"],
      ["Jan", 100, 80],
      ["Feb", 120, 90],
    ]);

    const plan = await svc.validate("sheet-id", range, {
      type: "STACKED_COLUMN",
      range: "Sheet1!A1:C3",
    });

    expect(plan.kind).toBe("basic");
    expect(plan.basicChartType).toBe("COLUMN");
    expect(plan.stacked).toBe(true);
    expect(plan.seriesColumnIndexes).toEqual([1, 2]);
  });

  test("uses requested series only for stacked chart", async () => {
    const svc = makeValidator([
      ["Item", "Capex", "Capex/Cabin", "NOI Improvement", "Return on Cost"],
      ["A", 1000000, 300000, 450000, 0.35],
      ["B", 900000, 280000, 390000, 0.28],
    ]);

    const plan = await svc.validate(
      "sheet-id",
      {
        ...range,
        endColumnIndexExclusive: 5,
      },
      {
        type: "STACKED_COLUMN",
        range: "SUMMARY1!A1:E3",
        series: ["Capex", "NOI Improvement"],
      },
    );

    expect(plan.kind).toBe("basic");
    expect(plan.stacked).toBe(true);
    expect(plan.seriesColumnIndexes).toEqual([1, 3]);
  });

  test("maps partial natural-language series labels to matching headers", async () => {
    const svc = makeValidator([
      ["Item", "Capex", "NOI Improvement", "Return on Cost"],
      ["A", 1000000, 450000, 0.35],
      ["B", 900000, 390000, 0.28],
    ]);

    const plan = await svc.validate(
      "sheet-id",
      {
        ...range,
        endColumnIndexExclusive: 4,
      },
      {
        type: "STACKED_COLUMN",
        range: "SUMMARY1!A1:D3",
        series: ["capex", "noi"],
      },
    );

    expect(plan.kind).toBe("basic");
    expect(plan.seriesColumnIndexes).toEqual([1, 2]);
  });

  test("throws compatibility error for bubble with only one numeric column", async () => {
    const svc = makeValidator([
      ["Category", "Value"],
      ["A", 10],
      ["B", 20],
    ]);

    await expect(
      svc.validate("sheet-id", range, {
        type: "BUBBLE",
        range: "Sheet1!A1:B3",
      }),
    ).rejects.toMatchObject({ code: "CHART_INCOMPATIBLE_SHAPE_BUBBLE" });
  });

  test("throws compatibility error for histogram when multiple numeric columns are selected", async () => {
    const svc = makeValidator([
      ["Revenue", "Cost"],
      [100, 80],
      [120, 95],
    ]);

    await expect(
      svc.validate("sheet-id", range, {
        type: "HISTOGRAM",
        range: "Sheet1!A1:B3",
      }),
    ).rejects.toMatchObject({ code: "CHART_INCOMPATIBLE_SHAPE_HISTOGRAM" });
  });

  test("returns combo plan with at least one line series", async () => {
    const svc = makeValidator([
      ["Month", "Revenue", "Cost", "Margin"],
      ["Jan", 100, 70, 30],
      ["Feb", 120, 75, 45],
      ["Mar", 130, 80, 50],
    ]);

    const plan = await svc.validate(
      "sheet-id",
      {
        ...range,
        endColumnIndexExclusive: 4,
      },
      {
        type: "COMBO",
        range: "Sheet1!A1:D4",
        comboSeries: { lineSeries: ["Margin"] },
      },
    );

    expect(plan.kind).toBe("basic");
    expect(plan.basicChartType).toBe("COMBO");
    expect(plan.seriesColumnIndexes).toEqual([1, 2, 3]);
    expect(plan.comboLineSeriesColumnIndexes).toEqual([3]);
  });

  test("maps absolute Excel column letters for combo bar/line series", async () => {
    const svc = makeValidator([
      ["Item", "Capex", "Capex/Cabin", "NOI Improvement", "Return on Cost"],
      ["A", 1000000, 300000, 450000, 0.35],
      ["B", 900000, 280000, 390000, 0.28],
      ["C", 850000, 260000, 320000, 0.24],
    ]);

    const plan = await svc.validate(
      "sheet-id",
      {
        startColumnIndex: 2, // C
        endColumnIndexExclusive: 7, // G
        startRowIndex: 4,
        endRowIndexExclusive: 9,
      },
      {
        type: "COMBO",
        range: "SUMMARY1!C5:G9",
        comboSeries: {
          barSeries: ["D", "E"],
          lineSeries: ["G"],
        },
      },
    );

    expect(plan.kind).toBe("basic");
    expect(plan.basicChartType).toBe("COMBO");
    expect(plan.seriesColumnIndexes).toEqual([1, 2, 4]); // D,E,G in local range coords.
    expect(plan.comboLineSeriesColumnIndexes).toEqual([4]); // G
  });

  test("returns bubble plan for 3 numeric columns + labels", async () => {
    const svc = makeValidator([
      ["Name", "X", "Y", "Size"],
      ["A", 10, 30, 120],
      ["B", 15, 20, 80],
      ["C", 12, 24, 100],
    ]);

    const plan = await svc.validate(
      "sheet-id",
      {
        ...range,
        endColumnIndexExclusive: 4,
      },
      {
        type: "BUBBLE",
        range: "Sheet1!A1:D4",
      },
    );

    expect(plan.kind).toBe("bubble");
    expect(plan.bubble).toBeDefined();
    expect(plan.bubble?.xColumnIndex).toBe(1);
    expect(plan.bubble?.yColumnIndex).toBe(2);
    expect(plan.bubble?.sizeColumnIndex).toBe(3);
  });

  test("returns histogram plan for one numeric column", async () => {
    const svc = makeValidator([["Revenue"], [100], [120], [140]]);

    const plan = await svc.validate(
      "sheet-id",
      {
        ...range,
        endColumnIndexExclusive: 1,
      },
      {
        type: "HISTOGRAM",
        range: "Sheet1!A1:A4",
        histogram: { bucketSize: 20 },
      },
    );

    expect(plan.kind).toBe("histogram");
    expect(plan.histogram?.valueColumnIndex).toBe(0);
    expect(plan.histogram?.bucketSize).toBe(20);
  });

  test("throws chart-type-not-supported for radar", async () => {
    const svc = makeValidator([
      ["Category", "S1", "S2"],
      ["A", 10, 20],
      ["B", 15, 25],
    ]);

    await expect(
      svc.validate("sheet-id", range, {
        type: "RADAR",
        range: "Sheet1!A1:C3",
      }),
    ).rejects.toMatchObject({ code: "CHART_TYPE_NOT_SUPPORTED" });
  });

  test("rejects pie with negative values", async () => {
    const svc = makeValidator([
      ["Category", "Value"],
      ["A", 10],
      ["B", -2],
    ]);

    await expect(
      svc.validate("sheet-id", range, {
        type: "PIE",
        range: "Sheet1!A1:B3",
      }),
    ).rejects.toMatchObject({ code: "CHART_INCOMPATIBLE_SHAPE_PIE" });
  });
});
