// Renders the real v2 watchlists home in pinned headless Chromium and checks the layout at
// phone, tablet and desktop widths. The check creates its own disposable v1 fixture database and
// starts the v2 process, so it depends on neither a deployed preview, a manually started server,
// nor the in-app browser connection.
const { test, before, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { launchPinnedBrowser } = require("../../tools/playwright-browser.cjs");
const { startServer, stopServer } = require("./layout-server.cjs");
const { measureHome } = require("./watchlists-home-geometry.cjs");
const {
  assertClearHidden,
  assertClearPlacement,
  assertGridDensity,
  assertHeading,
  assertNoOverflow,
  assertNoSortControl,
} = require("./watchlists-home-assertions.cjs");

const artifactsDirectory =
  process.env.JANUS_VISUAL_ARTIFACTS ?? path.join(__dirname, "artifacts", "watchlists-home");
const searchTerm = "Layout";
const viewports = [
  { width: 320, height: 568, columns: 2 },
  { width: 390, height: 844, columns: 2 },
  { width: 768, height: 1024, columns: 4 },
  { width: 1280, height: 800, columns: 4 },
];

function viewportLabel(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

async function captureFailure(page, name) {
  fs.mkdirSync(artifactsDirectory, { recursive: true });
  const file = path.join(artifactsDirectory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  process.stderr.write(`Saved failure screenshot ${file}\n`);
}

async function waitForSearchResults(page) {
  await page.fill("#query", searchTerm);
  await page.waitForFunction(
    () => {
      const heading = document.querySelector("#watchlist-browse .browse-heading h2");
      return heading?.textContent.trim() === "Search results";
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => {
      const clear = document.querySelector(".search-field .clear-search");
      if (!clear) return false;
      return getComputedStyle(clear).display !== "none";
    },
    undefined,
    { timeout: 15_000 },
  );
}

function assertEmptyState(measured, viewport, label) {
  assertNoOverflow(measured, label);
  assertGridDensity(measured, viewport.columns, label);
  assertNoSortControl(measured, label);
  assertHeading(measured, "Watchlists", label);
  assertClearHidden(measured, label);
}

function assertSearchState(measured, viewport, label) {
  assertNoOverflow(measured, label);
  assertGridDensity(measured, viewport.columns, label);
  assertNoSortControl(measured, label);
  assertHeading(measured, "Search results", label);
  assertClearPlacement(measured, label);
}

let browser;
let server;

before(async () => {
  fs.rmSync(artifactsDirectory, { recursive: true, force: true });
  server = await startServer();
  browser = await launchPinnedBrowser("chromium");
  const { version } = require("playwright-core/package.json");
  process.stdout.write(
    `watchlists home check: Chromium ${browser.version()} from pinned playwright-core ${version}\n`,
  );
});

after(async () => {
  if (browser) await browser.close();
  if (server) {
    await stopServer(server.child);
    fs.rmSync(server.temporaryDirectory, { recursive: true, force: true });
  }
});

for (const viewport of viewports) {
  const label = viewportLabel(viewport);
  test(`v2 watchlists home keeps its layout at ${label}`, async () => {
    const page = await browser.newPage({ viewport });
    let stage = "empty";
    try {
      await page.goto(`${server.baseURL}/v2/watchlists`, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      assertEmptyState(await measureHome(page), viewport, `${label} with an empty search`);

      stage = "search";
      await waitForSearchResults(page);
      assertSearchState(await measureHome(page), viewport, `${label} with "${searchTerm}"`);
    } catch (error) {
      await captureFailure(page, `${label}-${stage}`);
      throw error;
    } finally {
      await page.close();
    }
  });
}
