#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launchBrowser } = require("./playwright-browser.cjs");

function inlineOption(name, argument) {
  const match = argument.match(new RegExp(`^--${name}=(.+)$`));
  return match?.[1] ?? null;
}

function standaloneOption(name, argument) {
  return argument === `--${name}`;
}

function standaloneValues(name, args, index) {
  if (!standaloneOption(name, args[index])) return [];
  return args[index + 1] ? [args[index + 1]] : [];
}

function optionValues(name, args, index) {
  const inline = inlineOption(name, args[index]);
  if (inline !== null) return [inline];
  return standaloneValues(name, args, index);
}

function options(name) {
  const args = process.argv.slice(2);
  return args.flatMap((_, index) => optionValues(name, args, index));
}

function option(name, fallback) {
  return options(name)[0] ?? fallback;
}

function v2Path(route) {
  if (route.startsWith("/v2/")) return route.slice(3);
  if (route === "/v2") return "/";
  return route;
}

function clickLocator(page, value) {
  const role = value.match(/^([a-z][a-z-]*)=(.+)$/i);
  if (role) return page.getByRole(role[1], { name: role[2], exact: false }).first();
  return page.getByText(value, { exact: false }).first();
}

function outsideHorizontal(bounds) {
  return bounds.left < 0 || bounds.right > bounds.viewportWidth;
}

function outsideVertical(bounds) {
  return bounds.top < 0 || bounds.bottom > bounds.viewportHeight;
}

function outsideViewport(bounds) {
  return outsideHorizontal(bounds) || outsideVertical(bounds);
}

async function assertInViewport(page, selector) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible" });
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  if (outsideViewport(bounds)) {
    throw new Error(`${selector} is outside the viewport: ${JSON.stringify(bounds)}`);
  }
}

async function runClicks(page, clicks) {
  for (const click of clicks) {
    const locator = clickLocator(page, click);
    await locator.waitFor({ state: "visible" });
    await locator.click();
  }
}

async function waitForSelectors(page, selectors) {
  for (const selector of selectors) {
    await page.locator(selector).first().waitFor({ state: "visible" });
  }
}

async function scrollPage(page, scroll) {
  if (scroll > 0) await page.evaluate((top) => window.scrollTo(0, top), scroll);
}

async function waitForHydration(page, legacy) {
  if (!legacy) return;
  await page
    .waitForFunction(() => Boolean(window.__TSR_ROUTER__), null, { timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function preparePage(page, captureOptions) {
  const { clicks, legacy, scroll, waits } = captureOptions;
  await waitForHydration(page, legacy);
  await scrollPage(page, scroll);
  await runClicks(page, clicks);
  await waitForSelectors(page, waits);
  await page.waitForTimeout(250);
}

async function assertIfRequested(page, selector) {
  if (selector) await assertInViewport(page, selector);
}

async function capture(browser, url, captureOptions) {
  const { assertSelector, file, viewport } = captureOptions;
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await preparePage(page, captureOptions);
    await page.screenshot({ path: file });
    await assertIfRequested(page, assertSelector);
  } finally {
    await page.close();
  }
}

function validScroll(scroll) {
  return Number.isFinite(scroll) && scroll >= 0;
}

function scrollPosition() {
  const scroll = Number(option("scroll", "0"));
  if (!validScroll(scroll)) throw new Error("--scroll must be a non-negative number");
  return scroll;
}

async function main() {
  const route = option("route", "/watchlists");
  const click = options("click");
  const clickV1 = [...click, ...options("click-v1")];
  const clickV2 = [...click, ...options("click-v2")];
  const waits = options("wait");
  const assertSelector = option("assert-in-viewport", "");
  const scroll = scrollPosition();
  const [width, height] = option("viewport", "1280x900").split("x").map(Number);
  const directory = option("out", path.join(os.tmpdir(), "janus-visual-compare"));
  fs.mkdirSync(directory, { recursive: true });
  const slug = route.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home";
  const browser = await launchBrowser();
  try {
    const v1 = path.join(directory, `${slug}-v1.png`);
    const v2 = path.join(directory, `${slug}-v2.png`);
    await capture(browser, `http://localhost:3000${route}`, {
      clicks: clickV1,
      legacy: true,
      scroll,
      waits,
      assertSelector,
      file: v1,
      viewport: { width, height },
    });
    await capture(browser, `http://localhost:3001/v2${v2Path(route)}`, {
      clicks: clickV2,
      legacy: false,
      scroll,
      waits,
      assertSelector,
      file: v2,
      viewport: { width, height },
    });
    process.stdout.write(`v1: ${v1}\nv2: ${v2}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
