#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function installedChromium() {
  const cached = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(cached)) return null;
  const versions = fs
    .readdirSync(cached)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse();
  const executables = versions.map((version) =>
    path.join(cached, version, "chrome-linux64", "chrome"),
  );
  return executables.find((executable) => fs.existsSync(executable)) || null;
}

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  return installedChromium() || chromium.executablePath();
}

function v2Path(route) {
  if (route.startsWith("/v2/")) return route.slice(3);
  if (route === "/v2") return "/";
  return route;
}

async function capture(browser, url, click, file, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle" });
  if (click) await page.getByText(click, { exact: false }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: false });
  await page.close();
}

async function main() {
  const route = option("route", "/watchlists");
  const click = option("click", "");
  const [width, height] = option("viewport", "1280x900").split("x").map(Number);
  const directory = option("out", path.join(os.tmpdir(), "janus-visual-compare"));
  fs.mkdirSync(directory, { recursive: true });
  const slug = route.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home";
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
  try {
    const v1 = path.join(directory, `${slug}-v1.png`);
    const v2 = path.join(directory, `${slug}-v2.png`);
    await capture(browser, `http://localhost:3000${route}`, click, v1, { width, height });
    await capture(browser, `http://localhost:3001/v2${v2Path(route)}`, click, v2, {
      width,
      height,
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
