#!/usr/bin/env node
/**
 * Measures the watchlist timeline in a real Chromium renderer: mount cost, long tasks,
 * mounted row counts, scroll frame pacing, filter interaction latency and reorder cost.
 *
 * Requires a seeded database (see SeedTimelineFixture.mjs) and a dev server pointed at it:
 *   DATABASE_URL=/tmp/janus-timeline-bench.sqlite npm run dev
 *
 * Playwright is not a repository dependency. Install it locally before measuring:
 *   npm install --no-save playwright@1.56.1
 *   npx playwright install chromium
 *
 * Usage:
 *   node tools/bench/MeasureTimeline.mjs --watchlist 1 --label release-2000 --rows 2000
 *   node tools/bench/MeasureTimeline.mjs --watchlist 2 --label custom-2000 --rows 2000 --mobile
 *   node tools/bench/MeasureTimeline.mjs --watchlist 1 --label release-500 --rows 500
 *
 * Results are printed as JSON. Store them in the ticket or the baseline document; do not
 * compare numbers across machines or across headless/headed runs.
 */
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://localhost:3000" },
    watchlist: { type: "string", default: "1" },
    label: { type: "string", required: true },
    rows: { type: "string", default: "2000" },
    mobile: { type: "boolean", default: false },
    "timeout-ms": { type: "string", default: "180000" },
  },
});

const baseUrl = values["base-url"];
const watchlistId = values.watchlist;
const label = values.label;
const targetRows = Number.parseInt(values.rows, 10);
const timeout = Number.parseInt(values["timeout-ms"], 10);
const pageTimeoutMs = Math.min(timeout, 30_000);
const interactionTimeoutMs = Math.min(timeout, 10_000);
const PAGE_SIZE = 50;
const mobile = values.mobile;
const url = `${baseUrl}/watchlists/${watchlistId}`;

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
});
const context = await browser.newContext(
  mobile
    ? {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      }
    : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.addInitScript(() => {
  const metrics = { longTasks: [], events: [] };
  window.__timelineBench = metrics;

  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      metrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    });
  }).observe({ type: "longtask", buffered: true });

  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      metrics.events.push({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
      });
    });
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
});

await page.goto(url, { waitUntil: "commit" });
const responseEnd = await page.evaluate(() => {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry ? entry.responseEnd : 0;
});

await page.waitForSelector('[data-testid^="watchlist-timeline-row-"]', { timeout });
const firstRowMs = await page.evaluate((baseline) => performance.now() - baseline, responseEnd);
// Hydration replaces the server tree once, so wait for the mounted timeline to settle
// before timing incremental page loads and interactions.
await waitForStableRows(page);
await page.waitForTimeout(1000);

const pageLoads = [];
let previousHeight = await documentHeight(page);
pageLoads.push({
  pages: 1,
  mountedRows: await countRows(page),
  documentHeight: previousHeight,
  elapsedMs: Math.round(await nowMs(page)),
});

while ((await hasMore(page)) && pageLoads.length * PAGE_SIZE < targetRows) {
  const startedAt = await nowMs(page);
  await scrollThroughTimeline(page);
  const reached = await waitForPageGrowth(page, previousHeight, pageTimeoutMs);
  const height = await documentHeight(page);
  const rows = await countRows(page);
  console.error(
    `[measure] page ${pageLoads.length + 1}: mountedRows=${rows} documentHeight=${height} grew=${reached}`,
  );
  pageLoads.push({
    pages: pageLoads.length + 1,
    mountedRows: rows,
    documentHeight: height,
    elapsedMs: Math.round((await nowMs(page)) - startedAt),
  });
  if (!reached) break;
  previousHeight = height;
}

const mounted = await page.evaluate(() => ({
  timelineRows: document.querySelectorAll('[data-testid^="watchlist-timeline-row-"]').length,
  watchedDisclosures: Array.from(document.querySelectorAll("button[aria-expanded]")).length,
  yearHeaders: Array.from(document.querySelectorAll("body div")).filter((node) => {
    const text = node.textContent?.trim() ?? "";
    return (
      /^(1[89]|20)\d{2}$|^TBA$/.test(text) &&
      text.length <= 4 &&
      getComputedStyle(node).position === "sticky"
    );
  }).length,
  totalDomElements: document.querySelectorAll("*").length,
  usedJsHeapSize: performance.memory?.usedJSHeapSize ?? null,
  documentHeight: document.documentElement.scrollHeight,
}));

const calibration = await measureCalibration(page);
const longTasks = await page.evaluate(() => window.__timelineBench.longTasks);
const events = await page.evaluate(() => window.__timelineBench.events);
const loadPhase = summarizeLongTasks(longTasks);
const scroll = await measureOrReportFailure(measureScroll, page);
const filter = await measureOrReportFailure(measureFilterToggle, page);
const runExpansion = await measureOrReportFailure(measureRunExpansion, page);
const reorder = await measureOrReportFailure(measureReorder, page);
const search = await measureOrReportFailure(measureSearchInput, page);

const report = {
  label,
  environment: {
    url,
    mobile,
    viewport: page.viewportSize(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    deviceMemory: await page.evaluate(() => navigator.deviceMemory ?? null),
    headless: true,
  },
  dataset: {
    itemCount: Number.parseInt(
      await page.evaluate(() => {
        const text = document.body.textContent ?? "";
        const match = text.match(/(\d+)\/(\d+) Watched/);
        return match ? match[2] : "0";
      }),
      10,
    ),
    loadedPages: pageLoads.length,
    loadedItems: Math.min(pageLoads.length * PAGE_SIZE, targetRows),
    loadedItemsTarget: targetRows,
  },
  load: {
    firstRowMs: Math.round(firstRowMs),
    pageLoads,
    longTasks: loadPhase,
    events: summarizeLongTasks(events),
  },
  calibration,
  mounted,
  scroll,
  filter,
  search,
  reorder,
  runExpansion,
  consoleErrors: consoleErrors
    .filter((message) => !message.includes("net::ERR_FAILED"))
    .slice(0, 10),
};

console.log(JSON.stringify(report, null, 2));
await browser.close();

async function countRows(page) {
  return page.evaluate(
    () => document.querySelectorAll('[data-testid^="watchlist-timeline-row-"]').length,
  );
}

async function documentHeight(page) {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

async function waitForPageGrowth(page, previousHeight, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await documentHeight(page)) > previousHeight) return true;
    if (!(await hasMore(page))) return false;
    await page.waitForTimeout(200);
  }
  return false;
}

async function waitForStableRows(page) {
  let lastCount = -1;
  let stableReads = 0;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const count = await countRows(page);
    stableReads = count > 0 && count === lastCount ? stableReads + 1 : 0;
    if (stableReads >= 4) return count;
    lastCount = count;
    await page.waitForTimeout(250);
  }
  return lastCount;
}

async function nowMs(page) {
  return page.evaluate(() => performance.now());
}

async function hasMore(page) {
  return page.evaluate(() => !(document.body.textContent ?? "").includes("End of Watchlist"));
}

async function scrollThroughTimeline(page) {
  // Step through the document so the load-more sentinel leaves and re-enters the viewport.
  // Jumping straight to the bottom is not reliable: an instant scroll that happens while the
  // hydrated tree is still settling leaves the sentinel without a fresh intersection change.
  await page.evaluate(async () => {
    const step = Math.max(320, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - step));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function summarizeLongTasks(entries) {
  const durations = entries.map((entry) => entry.duration).sort((left, right) => left - right);
  return {
    count: durations.length,
    totalMs: Math.round(durations.reduce((total, duration) => total + duration, 0)),
    maxMs: durations.length ? Math.round(durations[durations.length - 1]) : 0,
    p95Ms: percentile(durations, 0.95),
    over50Ms: durations.filter((duration) => duration > 50).length,
  };
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio));
  return Math.round(sortedValues[index]);
}

async function measureCalibration(page) {
  return page.evaluate(async () => {
    const startedAt = performance.now();
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden";
    for (let index = 0; index < 5000; index += 1) {
      const node = document.createElement("div");
      node.textContent = `calibration row ${index}`;
      container.append(node);
    }
    document.body.append(container);
    container.getBoundingClientRect();
    const domBuildMs = performance.now() - startedAt;
    container.remove();

    const idleFrames = [];
    let previous = performance.now();
    for (let frame = 0; frame < 30; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      idleFrames.push(now - previous);
      previous = now;
    }
    const sorted = [...idleFrames].sort((left, right) => left - right);
    return {
      domBuild5000NodesMs: Math.round(domBuildMs),
      idleFrameP50Ms: Math.round(sorted[Math.floor(idleFrames.length * 0.5)]),
      idleFrameP95Ms: Math.round(sorted[Math.floor(idleFrames.length * 0.95)]),
    };
  });
}

async function measureScroll(page) {
  return page.evaluate(async () => {
    const frameTimes = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const step = Math.max(320, document.documentElement.clientHeight * 0.6);
    let index = 0;
    while (performance.now() - startedAt < 3000) {
      window.scrollBy(0, index % 2 === 0 ? step : -step);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frameTimes.push(now - previous);
      previous = now;
      index += 1;
    }
    const frames = frameTimes.length;
    const sorted = [...frameTimes].sort((left, right) => left - right);
    return {
      frames,
      elapsedMs: Math.round(performance.now() - startedAt),
      averageFrameMs: Math.round(frameTimes.reduce((total, time) => total + time, 0) / frames),
      p50FrameMs: Math.round(sorted[Math.floor(frames * 0.5)]),
      p95FrameMs: Math.round(sorted[Math.floor(frames * 0.95)]),
      maxFrameMs: Math.round(sorted[frames - 1]),
      over32Ms: frameTimes.filter((time) => time > 32).length,
      over50Ms: frameTimes.filter((time) => time > 50).length,
    };
  });
}

async function measureFilterToggle(page) {
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(250);
  const rowsBefore = await countRows(page);
  const heightBefore = await documentHeight(page);
  const allButton = page.getByRole("button", { name: "All", exact: true });
  if ((await allButton.count()) === 0) return { supported: false };

  // Block further page loads so the measurement captures the local re-render only.
  return withNetworkBlocked(page, async () => {
    const startedAt = await nowMs(page);
    await allButton.click();
    const changed = await waitForPageGrowth(page, heightBefore, interactionTimeoutMs);
    return {
      supported: true,
      clickToFilterMs: Math.round((await nowMs(page)) - startedAt),
      rowsChanged: changed,
      rowsBefore,
      rowsAfter: await countRows(page),
    };
  });
}

async function measureSearchInput(page) {
  const supported = await page.evaluate(
    () => document.querySelector('input[aria-label="Search titles"]') !== null,
  );
  if (!supported) return { supported: false };
  return withNetworkBlocked(page, () =>
    page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Search titles"]');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const startedAt = performance.now();
      valueSetter.call(input, "Benchmark");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      return {
        supported: true,
        keystrokeToPaintMs: Math.round(performance.now() - startedAt),
      };
    }),
  );
}

/**
 * Expanding a collapsed watched run mounts its rows. On a long list this is the largest
 * single-block mount the timeline can trigger, so it doubles as the interaction probe.
 */
async function measureRunExpansion(page) {
  const disclosure = page.locator('button[aria-expanded="false"]').first();
  if ((await disclosure.count()) === 0) return { supported: false };

  const heightBefore = await documentHeight(page);
  const rowsBefore = await countRows(page);
  const startedAt = await nowMs(page);
  await disclosure.click();
  const grew = await waitForPageGrowth(page, heightBefore, interactionTimeoutMs);
  return {
    supported: true,
    clickToExpansionMs: Math.round((await nowMs(page)) - startedAt),
    expanded: grew,
    rowsBefore,
    rowsAfter: await countRows(page),
  };
}

async function measureOrReportFailure(measure, ...args) {
  try {
    return await measure(...args);
  } catch (error) {
    return { supported: false, error: String(error).split("\n")[0] };
  }
}

async function withNetworkBlocked(page, run) {
  await page.route("**/*", (route) =>
    route.request().resourceType() === "document" ? route.continue() : route.abort(),
  );
  try {
    return await run();
  } finally {
    await page.unroute("**/*");
  }
}

async function measureReorder(page) {
  const handle = page.locator('button[aria-label^="Move "]').first();
  if ((await handle.count()) === 0) return { supported: false };

  const orderBefore = await readOrder(page);
  const box = await handle.boundingBox();
  if (!box) return { supported: false };

  const startedAt = await nowMs(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + step * 40);
    await page.waitForTimeout(16);
  }
  const dragToDropMs = Math.round((await nowMs(page)) - startedAt);
  await page.mouse.up();
  const droppedAt = await nowMs(page);

  let orderAfter = orderBefore;
  const deadline = Date.now() + interactionTimeoutMs;
  while (Date.now() < deadline) {
    orderAfter = await readOrder(page);
    if (orderAfter[0] !== orderBefore[0]) break;
    await page.waitForTimeout(100);
  }

  return {
    supported: true,
    dragToDropMs,
    dropToOrderChangeMs: Math.round((await nowMs(page)) - droppedAt),
    orderChanged: orderAfter[0] !== orderBefore[0],
    firstRowBefore: orderBefore[0],
    firstRowAfter: orderAfter[0],
  };
}

async function readOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="watchlist-timeline-row-"]'))
      .slice(0, 5)
      .map((row) => row.getAttribute("data-testid")),
  );
}
