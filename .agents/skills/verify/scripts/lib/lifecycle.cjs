const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  booleanOption,
  currentGitHead,
  defaultRunId,
  evidenceDirectoryFor,
  readState,
  repoRoot,
  requireRunId,
  runtimeDirectoryFor,
  sanitizeRunId,
  stringOption,
  writeState,
} = require("./paths.cjs");
const { reserveFreePort, spawnDetached, stopRecordedPid, waitForReady } = require("./process.cjs");

function assertDependenciesInstalled() {
  const drizzleDirectory = path.join(repoRoot, "node_modules", "drizzle-orm");
  const tsxBinary = path.join(repoRoot, "node_modules", ".bin", "tsx");
  if (!fs.existsSync(drizzleDirectory) || !fs.existsSync(tsxBinary)) {
    throw new Error(
      `Root dependencies are missing. Run "bash tools/pinned-node.sh npm ci" from ${repoRoot}.`,
    );
  }
}

function parsePort(explicit, flagName) {
  const port = Number(explicit);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port for --${flagName}: "${explicit}".`);
  }
  return port;
}

async function resolvePort(options, flagName) {
  const explicit = stringOption(options, flagName, "");
  return explicit ? parsePort(explicit, flagName) : reserveFreePort();
}

function migrateAndSeed(databasePath, skipSeed) {
  const tsxBinary = path.join(repoRoot, "node_modules", ".bin", "tsx");
  const environment = { ...process.env, DATABASE_URL: databasePath, SEED_ON_STARTUP: "true" };
  execFileSync(tsxBinary, ["src/db/Migrate.ts"], {
    cwd: repoRoot,
    env: environment,
    stdio: "pipe",
  });
  if (!skipSeed) {
    execFileSync(tsxBinary, ["src/db/Seed.ts"], { cwd: repoRoot, env: environment, stdio: "pipe" });
  }
}

function buildV2Binary() {
  const cargo = process.env.CARGO || "cargo";
  execFileSync(cargo, ["build", "--manifest-path", "v2/Cargo.toml", "--locked"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function ensureV2Binary(skipBuild) {
  const binaryPath = path.join(repoRoot, "v2", "target", "debug", "janus-v2");
  if (!skipBuild || !fs.existsSync(binaryPath)) buildV2Binary();
  return binaryPath;
}

async function fetchText(url, headers) {
  try {
    const response = await fetch(url, { headers });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch {
    return { ok: false, status: 0, body: "" };
  }
}

async function checkV2Ready(baseUrl) {
  const ready = await fetchText(`${baseUrl}/v2/health/ready`, {});
  if (!ready.ok || !ready.body.includes("Database compatibility validated")) return false;
  const list = await fetchText(`${baseUrl}/v2/watchlists`, { Accept: "application/json" });
  return list.ok;
}

async function checkV1Ready(baseUrl, skipSeed) {
  const page = await fetchText(`${baseUrl}/watchlists`, {});
  if (!page.ok) return false;
  return skipSeed
    ? page.body.includes("My Lists")
    : page.body.includes("Marvel Cinematic Universe");
}

async function startV2(state, options) {
  if (booleanOption(options, "v1-only")) return;
  const binaryPath = ensureV2Binary(booleanOption(options, "no-build"));
  const port = await resolvePort(options, "v2-port");
  state.v2Url = `http://127.0.0.1:${port}`;
  state.v2Log = path.join(state.runtimeDirectory, "v2.log");
  state.v2Pid = spawnDetached(
    binaryPath,
    [],
    path.join(repoRoot, "v2"),
    { ...process.env, DATABASE_URL: state.databasePath, JANUS_V2_BIND: `127.0.0.1:${port}` },
    state.v2Log,
  );
  await waitForReady("janus-v2", state.v2Pid, state.v2Log, () => checkV2Ready(state.v2Url), 30_000);
}

async function startV1(state, options, skipSeed) {
  if (booleanOption(options, "v2-only")) return;
  const port = await resolvePort(options, "v1-port");
  const viteBinary = path.join(repoRoot, "node_modules", ".bin", "vite");
  state.v1Url = `http://127.0.0.1:${port}`;
  state.v1Log = path.join(state.runtimeDirectory, "v1.log");
  state.v1Pid = spawnDetached(
    viteBinary,
    ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    repoRoot,
    { ...process.env, DATABASE_URL: state.databasePath },
    state.v1Log,
  );
  await waitForReady(
    "janus-v1",
    state.v1Pid,
    state.v1Log,
    () => checkV1Ready(state.v1Url, skipSeed),
    60_000,
  );
}

function initialState(options) {
  const runId = sanitizeRunId(stringOption(options, "run-id", defaultRunId()));
  const runtimeDirectory = runtimeDirectoryFor(runId);
  const evidenceDirectory = evidenceDirectoryFor(runId, stringOption(options, "evidence-dir", ""));
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  return {
    runId,
    gitHead: currentGitHead(),
    startedAt: new Date().toISOString(),
    runtimeDirectory,
    evidenceDirectory,
    databasePath: path.join(runtimeDirectory, "janus.sqlite"),
    v1Url: null,
    v2Url: null,
    v1Pid: null,
    v2Pid: null,
    v1Log: null,
    v2Log: null,
  };
}

async function launch(options) {
  assertDependenciesInstalled();
  const state = initialState(options);
  const skipSeed = booleanOption(options, "empty-db");
  try {
    migrateAndSeed(state.databasePath, skipSeed);
    await startV2(state, options);
    await startV1(state, options, skipSeed);
    writeState(state);
    return state;
  } catch (error) {
    await stopRecordedPid(state.v1Pid);
    await stopRecordedPid(state.v2Pid);
    fs.rmSync(state.runtimeDirectory, { recursive: true, force: true });
    throw error;
  }
}

function listFilesRecursive(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directoryPath, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

async function cleanup(options) {
  const runId = requireRunId(options);
  const state = readState(runId);
  const stopped = {
    v1Pid: (await stopRecordedPid(state.v1Pid)) ? state.v1Pid : null,
    v2Pid: (await stopRecordedPid(state.v2Pid)) ? state.v2Pid : null,
  };
  fs.rmSync(state.runtimeDirectory, { recursive: true, force: true });
  return {
    runId,
    stopped,
    removedRuntimeDirectory: state.runtimeDirectory,
    preservedEvidenceDirectory: state.evidenceDirectory,
    preservedEvidenceFiles: listFilesRecursive(state.evidenceDirectory),
  };
}

module.exports = { cleanup, launch };
