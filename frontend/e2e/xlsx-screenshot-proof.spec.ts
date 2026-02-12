/**
 * Screenshot proof: navigates to the XLSX document viewer and captures
 * screenshots proving the compute API wrote data + formulas to the file.
 *
 * Prerequisites: Run xlsx-editing-qa-api.py first to populate data.
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const API_URL = "https://localhost:5000";
const DOC_ID = "248f5b3e-185b-4193-9c39-c9b4c7db8365";
const SHEET = "Exerc\u00edcio 1";
const SCREENSHOT_DIR = "e2e/test-results/xlsx-proof";

async function login(page: Page) {
  await page.goto(`${BASE_URL}/a/x7k2m9?mode=login`);
  await page.fill('input[type="email"]', "test@koda.com");
  await page.fill('input[type="password"]', "test123");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL(/(?!.*mode=login)/, { timeout: 15000 });
  await page.waitForTimeout(2000);
}

async function getToken(page: Page): Promise<string> {
  return (await page.evaluate(() =>
    localStorage.getItem("accessToken")
  )) as string;
}

test.describe.serial("XLSX Screenshot Proof", () => {
  let page: Page;
  let apiCtx: APIRequestContext;

  test.beforeAll(async ({ browser, playwright }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    apiCtx = await playwright.request.newContext({
      ignoreHTTPSErrors: true,
    });
    await login(page);
  });

  test.afterAll(async () => {
    await apiCtx?.dispose();
    await page?.close();
  });

  test("1 — Populate data via compute API", async () => {
    const token = await getToken(page);

    // Populate product data + formulas + chart specs
    const resp = await apiCtx.post(
      `${API_URL}/api/documents/${DOC_ID}/studio/sheets/compute`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        data: {
          instruction: "Populate sales data with formulas and chart",
          ops: [
            {
              kind: "set_values",
              rangeA1: `${SHEET}!A1:C1`,
              values: [["Product", "Revenue ($)", "Projected (+15%)"]],
            },
            {
              kind: "set_values",
              rangeA1: `${SHEET}!A2:B7`,
              values: [
                ["Laptop Pro", 245000],
                ["Tablet Air", 182000],
                ["Phone Ultra", 310000],
                ["Smartwatch", 95000],
                ["Earbuds Max", 128000],
                ["TOTAL", ""],
              ],
            },
            { kind: "set_formula", a1: `${SHEET}!C2`, formula: "=B2*1.15" },
            { kind: "set_formula", a1: `${SHEET}!C3`, formula: "=B3*1.15" },
            { kind: "set_formula", a1: `${SHEET}!C4`, formula: "=B4*1.15" },
            { kind: "set_formula", a1: `${SHEET}!C5`, formula: "=B5*1.15" },
            { kind: "set_formula", a1: `${SHEET}!C6`, formula: "=B6*1.15" },
            { kind: "set_formula", a1: `${SHEET}!B7`, formula: "=SUM(B2:B6)" },
            { kind: "set_formula", a1: `${SHEET}!C7`, formula: "=SUM(C2:C6)" },
            {
              kind: "create_chart",
              spec: {
                type: "COLUMN",
                range: `${SHEET}!A1:C6`,
                title: "Revenue vs Projected Growth",
              },
            },
          ],
        },
      }
    );
    const body = await resp.json();
    console.log("Compute result:", JSON.stringify(body));
    expect(body.ok).toBe(true);
  });

  test("2 — Screenshot document viewer with data", async () => {
    // Navigate to document viewer
    await page.goto(`${BASE_URL}/d/m4w8j2/${DOC_ID}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for Excel preview table
    await page.waitForSelector("table.excel-preview-table", {
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Screenshot 1: Full viewer
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-excel-viewer-full.png`,
      fullPage: false,
    });
    console.log("Screenshot 01: Full viewer saved");

    // Screenshot 2: Data table only
    const table = page.locator("table.excel-preview-table");
    if (await table.isVisible()) {
      await table.screenshot({
        path: `${SCREENSHOT_DIR}/02-excel-data-table.png`,
      });
      console.log("Screenshot 02: Data table saved");
    }

    // Read and log cell data for proof
    const cellData = await page.evaluate(() => {
      const table = document.querySelector(
        "table.excel-preview-table"
      ) as HTMLTableElement;
      if (!table) return "No table found";
      const headers: string[] = [];
      table
        .querySelectorAll("thead th")
        .forEach((th) => headers.push(th.textContent?.trim() || ""));
      const rows: string[][] = [];
      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll("th, td").forEach((cell) =>
          cells.push(cell.textContent?.trim() || "")
        );
        rows.push(cells);
      });
      return { headers, rows: rows.slice(0, 10) };
    });
    console.log("\nCell data from viewer:");
    console.log(JSON.stringify(cellData, null, 2));
  });

  test("3 — Screenshot Ask Allybi editing panel", async () => {
    // Open the editing panel
    const askBtn = page.locator('button:has-text("Ask Allybi")');
    if ((await askBtn.count()) > 0 && (await askBtn.first().isVisible())) {
      await askBtn.first().click();
      await page.waitForTimeout(2000);

      // Screenshot 3: Editing panel
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-ask-allybi-panel.png`,
        fullPage: false,
      });
      console.log("Screenshot 03: Ask Allybi panel saved");
    } else {
      console.log("Ask Allybi button not found, taking viewer screenshot");
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-viewer-state.png`,
        fullPage: false,
      });
    }
  });
});
