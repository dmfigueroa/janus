import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";

const V2_ROOT = path.resolve(process.cwd(), "v2");

export interface RpcPayload {
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export interface V2McpSession {
  baseUrl: string;
  sessionId: string;
  rpc(method: string, params?: Record<string, unknown>): Promise<RpcPayload>;
  close(): Promise<void>;
}

let hasBuiltV2Binary = false;

export function ensureV2BinaryBuilt(): string {
  if (!hasBuiltV2Binary) {
    execFileSync(process.env.CARGO ?? "cargo", ["build", "--locked"], {
      cwd: V2_ROOT,
      stdio: "inherit",
    });
    hasBuiltV2Binary = true;
  }
  return path.join(V2_ROOT, "target", "debug", "janus-v2");
}

export async function startV2McpSession(databasePath: string): Promise<V2McpSession> {
  const binaryPath = ensureV2BinaryBuilt();
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const child = spawnV2Process(binaryPath, databasePath, port, output);

  try {
    await waitForHealth(`${baseUrl}/v2/health/ready`, child, output);
    const sessionId = await initializeMcpSession(baseUrl);
    return createSessionHandle(baseUrl, sessionId, child);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }
}

function spawnV2Process(
  binaryPath: string,
  databasePath: string,
  port: number,
  output: string[],
): ChildProcess {
  const child = spawn(binaryPath, {
    cwd: V2_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databasePath,
      JANUS_V2_BIND: `127.0.0.1:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.once("error", (error) => output.push(`${error.message}\n`));
  return child;
}

function createSessionHandle(
  baseUrl: string,
  sessionId: string,
  child: ChildProcess,
): V2McpSession {
  let nextId = 2;
  return {
    baseUrl,
    sessionId,
    async rpc(method, params) {
      const id = nextId;
      nextId += 1;
      const response = await postMcp(baseUrl, { jsonrpc: "2.0", id, method, params }, sessionId);
      return (await response.json()) as RpcPayload;
    },
    async close() {
      await fetch(`${baseUrl}/v2/mcp`, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId },
      }).catch(() => undefined);
      await stopProcess(child);
    },
  };
}

async function initializeMcpSession(baseUrl: string): Promise<string> {
  const initResponse = await postMcp(baseUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "parity-harness", version: "1.0.0" },
    },
  });
  const sessionId = initResponse.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error(`Missing mcp-session-id header: ${await initResponse.text()}`);
  }
  await postMcp(baseUrl, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  return sessionId;
}

function postMcp(baseUrl: string, body: Record<string, unknown>, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  return fetch(`${baseUrl}/v2/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function findAvailablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForHealth(url: string, child: ChildProcess, output: string[]): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isHealthy(url)) return;
    assertChildRunning(child, output);
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${url}\n${output.join("")}`);
}

async function isHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function assertChildRunning(child: ChildProcess, output: string[]): void {
  if (child.exitCode === null) return;
  throw new Error(`v2 exited early (${child.exitCode}):\n${output.join("")}`);
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
