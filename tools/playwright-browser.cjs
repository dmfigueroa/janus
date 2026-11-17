const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright-core");

const browsers = { chromium, firefox, webkit };

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

function browserFor(name) {
  const browser = browsers[name];
  if (!browser) throw new Error(`Unsupported browser: ${name}`);
  return browser;
}

function executableFor(name) {
  if (name === "chromium") return findChromium();
  return undefined;
}

function launchBrowser(name = "chromium") {
  return browserFor(name).launch({ executablePath: executableFor(name), headless: true });
}

// Deterministic launch for regression checks that must reproduce against the exact browser
// build bundled with the checked-in playwright-core version instead of the newest cached one.
function pinnedChromiumExecutable() {
  const executable = chromium.executablePath();
  if (!fs.existsSync(executable)) {
    const { version } = require("playwright-core/package.json");
    throw new Error(
      `Chromium ${executable} for playwright-core ${version} is not installed. ` +
        "Run `npx playwright-core install chromium` from the repository root.",
    );
  }
  return executable;
}

function launchPinnedBrowser(name = "chromium") {
  if (name !== "chromium") {
    throw new Error(`Only the pinned Chromium build is supported, received: ${name}`);
  }
  return chromium.launch({ executablePath: pinnedChromiumExecutable(), headless: true });
}

module.exports = { findChromium, launchBrowser, launchPinnedBrowser, pinnedChromiumExecutable };
