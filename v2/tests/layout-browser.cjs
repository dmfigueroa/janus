// Renders the real v2 watchlist home in headless Chromium and compares its footer and grid
// geometry with the v1 baseline in v1-layout-baseline.json. The check creates its own disposable
// v1 fixture database and starts the v2 process, so it depends on neither a deployed preview nor
// a manually started server.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { launchBrowser } = require("../../tools/playwright-browser.cjs");
const { v1Layout, v2Layout } = require("./layout-geometry.cjs");
const { startServer, stopServer } = require("./layout-server.cjs");

const baselinePath = path.join(__dirname, "v1-layout-baseline.json");
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const positionTolerance = 1;
const widthTolerance = 0.5;
const recording = process.env.JANUS_LAYOUT_RECORD === "1";
const v1BaseURL = process.env.JANUS_V1_BASE_URL ?? "http://localhost:3000";

function viewportLabel(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

async function openPage(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  return page;
}

function assertRecorded(recorded) {
  for (const [label, entry] of Object.entries(recorded)) {
    assert.equal(
      entry.footer.items.length,
      3,
      `${label}: measured ${entry.footer.items.length} footer items in the v1 reference, expected 3`,
    );
    assert.ok(
      entry.grid.cardWidths.length > 0,
      `${label}: measured no v1 grid cards; check the v1 fixture and route`,
    );
    assert.ok(entry.heading?.visible, `${label}: the v1 Watchlists heading was not visible`);
  }
}

async function recordBaseline() {
  const browser = await launchBrowser("chromium");
  try {
    const recorded = {};
    for (const viewport of viewports) {
      const page = await openPage(browser, `${v1BaseURL}/watchlists`, viewport);
      try {
        await page.locator('nav[aria-label="Primary navigation"]').waitFor({ state: "visible" });
        recorded[viewportLabel(viewport)] = await v1Layout(page);
      } finally {
        await page.close();
      }
    }
    assertRecorded(recorded);
    const cardWidthCap = Math.max(
      ...Object.values(recorded).flatMap((entry) => entry.grid.cardWidths),
    );
    const baseline = {
      reference: "v1 watchlist home rendered in headless Chromium",
      route: "/watchlists",
      recordedAt: new Date().toISOString().slice(0, 10),
      viewports: Object.fromEntries(
        Object.entries(recorded).map(([label, entry]) => [
          label,
          {
            footer: { items: entry.footer.items },
            grid: { columns: entry.grid.columns, cardWidthCap },
            heading: entry.heading,
          },
        ]),
      ),
    };
    fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(`Recorded ${baselinePath}\n`);
  } finally {
    await browser.close();
  }
}

function formatFooter(items) {
  return items
    .map((item) => `${item.label} ${item.left.toFixed(2)}..${item.right.toFixed(2)}`)
    .join(", ");
}

function assertFooterMatches(measuredFooter, expectedFooter) {
  const measured = measuredFooter.items;
  const expected = expectedFooter.items;
  assert.equal(
    measured.length,
    expected.length,
    `footer item count: measured ${measured.length} (${formatFooter(measured)}), expected ${expected.length} (${formatFooter(expected)}) from the v1 baseline`,
  );
  const tops = measured.map((item) => item.top);
  const rowSpread = Math.max(...tops) - Math.min(...tops);
  assert.ok(
    rowSpread <= positionTolerance,
    `footer items must share one row: measured tops ${tops.join(", ")}px spread ${rowSpread.toFixed(2)}px, expected a spread of at most ${positionTolerance}px`,
  );
  for (const [index, expectedItem] of expected.entries()) {
    const measuredItem = measured[index];
    assert.equal(
      measuredItem.label,
      expectedItem.label,
      `footer item ${index} label: measured "${measuredItem.label}", expected "${expectedItem.label}" from the v1 baseline`,
    );
    for (const edge of ["left", "right"]) {
      const drift = Math.abs(measuredItem[edge] - expectedItem[edge]);
      assert.ok(
        drift <= positionTolerance,
        `footer item "${expectedItem.label}" ${edge} drifted: measured ${measuredItem[edge].toFixed(2)}px, expected ${expectedItem[edge].toFixed(2)}px from the v1 baseline within ${positionTolerance}px; measured positions [${formatFooter(measured)}], expected positions [${formatFooter(expected)}]`,
      );
    }
  }
}

function assertGridMatches(measuredGrid, expectedGrid, { desktop }) {
  assert.equal(
    measuredGrid.columns,
    expectedGrid.columns,
    `grid columns: measured ${measuredGrid.columns}, expected ${expectedGrid.columns} from the v1 baseline`,
  );
  assert.ok(
    measuredGrid.cardCount > 0,
    "grid cards: measured no rendered cards, expected at least one fixture card",
  );
  const widest = Math.max(...measuredGrid.cardWidths);
  assert.ok(
    widest <= expectedGrid.cardWidthCap + widthTolerance,
    `card width cap: measured widest card ${widest.toFixed(2)}px, expected at most ${expectedGrid.cardWidthCap}px from the v1 baseline; measured card widths [${measuredGrid.cardWidths.join(", ")}]`,
  );
  if (desktop) {
    assert.ok(
      Math.abs(widest - expectedGrid.cardWidthCap) <= widthTolerance,
      `desktop card width: measured widest card ${widest.toFixed(2)}px, expected ${expectedGrid.cardWidthCap}px from the v1 baseline; measured card widths [${measuredGrid.cardWidths.join(", ")}]`,
    );
  }
}

function assertHeadingVisible(measuredHeading, expectedHeading) {
  assert.ok(
    measuredHeading,
    `Watchlists heading: measured none, expected a visible "${expectedHeading.text}" heading from the v1 baseline`,
  );
  assert.equal(
    measuredHeading.text,
    expectedHeading.text,
    `Watchlists heading text: measured "${measuredHeading.text}", expected "${expectedHeading.text}" from the v1 baseline`,
  );
  assert.ok(
    measuredHeading.visible,
    `Watchlists heading: measured hidden, expected visible "${expectedHeading.text}"`,
  );
}

if (recording) {
  test("records the v1 watchlist home layout baseline", async () => {
    await recordBaseline();
  });
} else {
  let browser;
  let server;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser("chromium");
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) {
      await stopServer(server.child);
      fs.rmSync(server.temporaryDirectory, { recursive: true, force: true });
    }
  });

  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

  for (const viewport of viewports) {
    const label = viewportLabel(viewport);
    test(`v2 watchlist home matches the v1 footer and grid geometry at ${label}`, async () => {
      const expected = baseline.viewports[label];
      assert.ok(expected, `No v1 baseline recorded for ${label} in ${baselinePath}.`);
      const page = await openPage(browser, `${server.baseURL}/v2/watchlists`, viewport);
      try {
        const measured = await v2Layout(page);
        assertFooterMatches(measured.footer, expected.footer);
        assertGridMatches(measured.grid, expected.grid, {
          desktop: viewport.width >= 768,
        });
        assertHeadingVisible(measured.heading, expected.heading);
      } finally {
        await page.close();
      }
    });
  }
}
