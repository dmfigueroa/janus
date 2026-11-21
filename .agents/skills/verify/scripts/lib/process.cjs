const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function spawnDetached(command, args, workingDirectory, environment, logPath) {
  const logDescriptor = fs.openSync(logPath, "a");
  try {
    const child = spawn(command, args, {
      cwd: workingDirectory,
      env: environment,
      detached: true,
      stdio: ["ignore", logDescriptor, logDescriptor],
    });
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(logDescriptor);
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryKill(targetPid, signal) {
  try {
    process.kill(targetPid, signal);
    return true;
  } catch {
    return false;
  }
}

function sendSignalToProcessGroup(pid, signal) {
  if (!pid) return;
  if (!tryKill(-pid, signal)) tryKill(pid, signal);
}

async function waitUntilExited(pid, deadline) {
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await delay(100);
  }
  return false;
}

async function stopRecordedPid(pid) {
  if (!isProcessAlive(pid)) return false;
  sendSignalToProcessGroup(pid, "SIGTERM");
  const exited = await waitUntilExited(pid, Date.now() + 5_000);
  if (!exited) sendSignalToProcessGroup(pid, "SIGKILL");
  return true;
}

function readLogTail(logPath) {
  if (!fs.existsSync(logPath)) return "";
  return fs.readFileSync(logPath, "utf8").slice(-2000);
}

function assertAlive(name, pid, logPath) {
  if (isProcessAlive(pid)) return;
  throw new Error(`${name} (pid ${pid}) exited before becoming ready.\n${readLogTail(logPath)}`);
}

async function waitForReady(name, pid, logPath, checkFunction, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await checkFunction()) return;
    assertAlive(name, pid, logPath);
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${name} to become ready. See ${logPath}.`);
}

module.exports = {
  delay,
  isProcessAlive,
  reserveFreePort,
  spawnDetached,
  stopRecordedPid,
  waitForReady,
};
