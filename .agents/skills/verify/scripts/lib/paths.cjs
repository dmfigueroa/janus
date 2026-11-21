const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const runtimePrefix = "janus-verify-";

function sanitizeRunId(rawRunId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(rawRunId)) {
    throw new Error(
      `Invalid run ID "${rawRunId}". Use letters, numbers, dots, underscores, or hyphens.`,
    );
  }
  return rawRunId;
}

function defaultRunId() {
  return `${Date.now().toString(36)}-${process.pid}`;
}

function runtimeDirectoryFor(runId) {
  return path.join(os.tmpdir(), `${runtimePrefix}${sanitizeRunId(runId)}`);
}

function evidenceDirectoryFor(runId, overrideDirectory) {
  if (overrideDirectory) return path.resolve(overrideDirectory);
  return path.join(os.tmpdir(), "janus-verify-evidence", sanitizeRunId(runId));
}

function statePathFor(runId) {
  return path.join(runtimeDirectoryFor(runId), "state.json");
}

function readState(runId) {
  const statePath = statePathFor(runId);
  if (!fs.existsSync(statePath)) {
    throw new Error(`No active verification run found for "${runId}" (${statePath} missing).`);
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(state.runtimeDirectory, { recursive: true });
  fs.writeFileSync(statePathFor(state.runId), `${JSON.stringify(state, null, 2)}\n`);
}

function currentGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function appendOption(options, name, value) {
  const existing = options[name];
  if (existing === undefined) {
    options[name] = value;
    return;
  }
  options[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
}

function isStandaloneValue(nextToken) {
  return Boolean(nextToken) && !nextToken.startsWith("--");
}

function parseLongFlag(flagName, nextToken, state) {
  if (isStandaloneValue(nextToken)) {
    appendOption(state.options, flagName, nextToken);
    return 2;
  }
  appendOption(state.options, flagName, true);
  return 1;
}

function parseFlagToken(token, nextToken, state) {
  const inlineMatch = token.match(/^--([a-zA-Z0-9-]+)=(.*)$/);
  if (inlineMatch) {
    appendOption(state.options, inlineMatch[1], inlineMatch[2]);
    return 1;
  }
  return parseLongFlag(token.slice(2), nextToken, state);
}

function parseArguments(argv) {
  const state = { options: {}, positionals: [] };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token.startsWith("--")) {
      index += parseFlagToken(token, argv[index + 1], state);
    } else {
      state.positionals.push(token);
      index += 1;
    }
  }
  return state;
}

function normalizeStringList(rawValue) {
  if ([undefined, true].includes(rawValue)) return [];
  return Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue)];
}

function stringOption(options, name, fallback) {
  const values = normalizeStringList(options[name]);
  return values.length > 0 ? values[0] : fallback;
}

function listOption(options, name) {
  return normalizeStringList(options[name]);
}

function booleanOption(options, name) {
  return options[name] === true || options[name] === "true";
}

function requireRunId(options) {
  const runId = stringOption(options, "run-id", process.env.JANUS_VERIFY_RUN_ID || "");
  if (!runId) {
    throw new Error("Missing --run-id <id> (or JANUS_VERIFY_RUN_ID environment variable).");
  }
  return sanitizeRunId(runId);
}

module.exports = {
  booleanOption,
  currentGitHead,
  defaultRunId,
  evidenceDirectoryFor,
  listOption,
  parseArguments,
  readState,
  repoRoot,
  requireRunId,
  runtimeDirectoryFor,
  sanitizeRunId,
  statePathFor,
  stringOption,
  writeState,
};
