const { parseArguments } = require("./paths.cjs");
const { cleanup, launch } = require("./lifecycle.cjs");
const { doctor } = require("./doctor.cjs");
const { drive } = require("./drive.cjs");
const { httpRequest, queryDatabase } = require("./inspect.cjs");

const usage = [
  "Usage: .agents/skills/verify/scripts/verify-janus <command> [options]",
  "",
  "Commands:",
  "  launch   [--run-id <id>] [--v1-port <port>] [--v2-port <port>] [--v1-only] [--v2-only] [--empty-db] [--no-build] [--evidence-dir <dir>]",
  "  doctor   --run-id <id>",
  "  drive    --run-id <id> [--target v1|v2] [--viewport 1280x800] [--feature <slug>] [--evidence-name <name>] [--steps-file <json> | --step '<json>' | stdin]",
  "  http     --run-id <id> [--target v1|v2] [--method GET|POST|DELETE] [--header 'K: V'] [--body '<json>'] [--save <relpath>] <path>",
  "  db       --run-id <id> [--save <relpath>] '<SELECT ...>'",
  "  cleanup  --run-id <id>",
].join("\n");

const handlers = {
  launch: (options) => launch(options),
  doctor: (options) => doctor(options),
  drive: (options) => drive(options),
  http: (options, positionals) => httpRequest(options, positionals),
  db: (options, positionals) => queryDatabase(options, positionals),
  cleanup: (options) => cleanup(options),
};

function isHelpCommand(command) {
  return !command || ["help", "--help", "-h"].includes(command);
}

function resolveHandler(command) {
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command "${command}".\n\n${usage}`);
  return handler;
}

function applyExitCode(command, result) {
  if (command === "doctor" && !result.ok) process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (isHelpCommand(command)) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const { options, positionals } = parseArguments(rest);
  const result = await resolveHandler(command)(options, positionals);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  applyExitCode(command, result);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
