const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { currentGitHead, readState, repoRoot, requireRunId } = require("./paths.cjs");
const { isProcessAlive } = require("./process.cjs");
const { findChromium } = require(path.join(repoRoot, "tools", "playwright-browser.cjs"));

function readCommandLine(pid) {
  const procPath = `/proc/${pid}/cmdline`;
  if (!fs.existsSync(procPath)) return "";
  return fs.readFileSync(procPath, "utf8").replaceAll("\0", " ").trim();
}

function matchesProcessOwner(pid, expectedCommandToken) {
  const commandLine = readCommandLine(pid);
  return !commandLine || commandLine.includes(expectedCommandToken);
}

async function probeEndpoint(url, expectedSubstring) {
  try {
    const response = await fetch(url);
    const body = await response.text();
    return { ok: response.ok && body.includes(expectedSubstring), status: response.status, url };
  } catch (error) {
    return { ok: false, status: 0, url, error: error.message };
  }
}

async function checkRunningService(url, pid, expectedCommandToken, probePath, expectedSubstring) {
  const ownerMatches = matchesProcessOwner(pid, expectedCommandToken);
  const http = await probeEndpoint(`${url}${probePath}`, expectedSubstring);
  return {
    enabled: true,
    ok: ownerMatches && http.ok,
    pid,
    alive: true,
    ownerMatches,
    url,
    httpStatus: http.status,
  };
}

async function checkService(url, pid, expectedCommandToken, probePath, expectedSubstring) {
  if (!url) return { enabled: false, ok: true };
  if (!isProcessAlive(pid)) {
    return { enabled: true, ok: false, pid, alive: false, ownerMatches: false, url, httpStatus: 0 };
  }
  return checkRunningService(url, pid, expectedCommandToken, probePath, expectedSubstring);
}

function checkDatabase(databasePath) {
  if (!fs.existsSync(databasePath)) {
    return { ok: false, error: `Database file missing: ${databasePath}` };
  }
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const watchlists = database.prepare("SELECT COUNT(*) AS count FROM watchlists").get().count;
    const items = database.prepare("SELECT COUNT(*) AS count FROM watchlist_items").get().count;
    return { ok: true, databasePath, watchlists, items };
  } finally {
    database.close();
  }
}

function checkChromium() {
  const executablePath = findChromium();
  const exists = Boolean(executablePath) && fs.existsSync(executablePath);
  return { ok: exists, executablePath };
}

async function doctor(options) {
  const runId = requireRunId(options);
  const state = readState(runId);
  const head = currentGitHead();
  const gitMatches = head === state.gitHead;
  const v1 = await checkService(state.v1Url, state.v1Pid, "vite", "/watchlists", "My Lists");
  const v2 = await checkService(
    state.v2Url,
    state.v2Pid,
    "janus-v2",
    "/v2/health/ready",
    "Database compatibility validated",
  );
  const database = checkDatabase(state.databasePath);
  const chromium = checkChromium();
  const ok = [gitMatches, v1.ok, v2.ok, database.ok, chromium.ok].every(Boolean);
  return {
    ok,
    runId,
    git: { ok: gitMatches, launchedHead: state.gitHead, currentHead: head },
    v1,
    v2,
    database,
    chromium,
    evidenceDirectory: state.evidenceDirectory,
  };
}

module.exports = { doctor };
