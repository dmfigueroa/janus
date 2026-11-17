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

module.exports = { findChromium, launchBrowser };
