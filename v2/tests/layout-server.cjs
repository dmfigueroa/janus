// Disposable v1 fixture database and v2 process for the layout regression check.
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createFixture(databasePath) {
  execFileSync(process.execPath, [path.join(__dirname, "create_v1_fixture.cjs"), databasePath], {
    cwd: root,
    stdio: "inherit",
  });
  const Database = require("better-sqlite3");
  const database = new Database(databasePath);
  try {
    const insertWatchlist = database.prepare(
      "INSERT INTO watchlists(id,name,description,item_order_mode) VALUES(?,?,?, 'release')",
    );
    const insertItem = database.prepare(
      "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,is_watched,release_date) VALUES(?,?,?,'tmdb','movie',?,?,?)",
    );
    function insertItems(watchlistId, index) {
      for (let item = 0; item < 3; item += 1) {
        insertItem.run(
          watchlistId * 10 + item,
          watchlistId,
          `layout-${watchlistId}-${item}`,
          `Layout item ${index + 1}.${item + 1}`,
          Number(item === 0),
          `2020-0${item + 1}-01`,
        );
      }
    }
    database.transaction(() => {
      for (let index = 0; index < 6; index += 1) {
        const watchlistId = 100 + index;
        insertWatchlist.run(watchlistId, `Layout list ${index + 1}`, "Layout fixture");
        insertItems(watchlistId, index);
      }
    })();
  } finally {
    database.close();
  }
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function healthy(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function assertRunning(child, output) {
  if (child.exitCode === null) return;
  throw new Error(`v2 exited before becoming ready (code ${child.exitCode}).\n${output.join("")}`);
}

async function waitForHealth(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await healthy(url)) return;
    assertRunning(child, output);
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.\n${output.join("")}`);
}

async function waitForExit(child, milliseconds) {
  if (!running(child)) return true;
  return Promise.race([
    once(child, "exit").then(() => true),
    delay(milliseconds).then(() => false),
  ]);
}

function running(child) {
  return Boolean(child) && child.exitCode === null;
}

async function stopServer(child) {
  if (!running(child)) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  child.kill("SIGKILL");
  await waitForExit(child, 5_000);
}

async function startServer() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "janus-layout-"));
  let child;
  try {
    const databasePath = path.join(temporaryDirectory, "v1.sqlite");
    await createFixture(databasePath);
    execFileSync(process.env.CARGO ?? "cargo", ["build", "--locked"], {
      cwd: root,
      stdio: "inherit",
    });
    const port = await availablePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const output = [];
    child = spawn(path.join(root, "target", "debug", "janus-v2"), {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: databasePath,
        JANUS_V2_BIND: `127.0.0.1:${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => output.push(chunk.toString()));
    child.once("error", (error) => output.push(`${error}\n`));
    await waitForHealth(`${baseURL}/v2/health/live`, child, output);
    return { baseURL, child, temporaryDirectory };
  } catch (error) {
    await stopServer(child);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { startServer, stopServer };
