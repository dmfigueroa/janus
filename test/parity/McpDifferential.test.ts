import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSqliteConnection, runSqliteMigrations } from "@/db/SqliteConnection.server";
import {
  canonicalizeJsonValue,
  canonicalizeSqliteSnapshot,
  type CanonicalResponse,
} from "./McpCanonicalize";
import { canonicalizeSchema } from "./McpSchemaCanonicalize";
import {
  collectFixtureTimestamps,
  loadMcpContract,
  resetAndSeedFixture,
  resolveStepArguments,
} from "./McpContract";
import { assertSqliteCheckRep, snapshotSqliteState } from "./SqliteCheckRep";
import { startV1McpSession, type V1McpSession } from "./V1McpSession";
import { startV2McpSession, type RpcPayload, type V2McpSession } from "./V2ServerProcess";

interface DeclaredTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

const contract = loadMcpContract();
const fixtureTimestamps = collectFixtureTimestamps(contract);

function canonicalizeRpcResponse(payload: RpcPayload): CanonicalResponse {
  if (payload.error) {
    expect(payload.error.code).toBe(-32602);
    return { kind: "rpcInvalidParams" };
  }
  const result = payload.result;
  expect(result).toBeDefined();

  if (result?.isError === true) {
    const content = result.content as Array<{ text?: string }> | undefined;
    return { kind: "toolError", errorText: content?.[0]?.text ?? "" };
  }

  const structured = result?.structuredContent;
  const content = result?.content as Array<{ text: string }>;
  expect(JSON.parse(content[0]!.text)).toEqual(structured);

  return {
    kind: "ok",
    structured: canonicalizeJsonValue(structured, fixtureTimestamps),
  };
}

function extractCursor(payload: RpcPayload): string | undefined {
  const structured = payload.result?.structuredContent as Record<string, unknown> | undefined;
  return typeof structured?.nextCursor === "string" ? structured.nextCursor : undefined;
}

describe("Janus v1 vs v2 MCP differential and shared-DB stateful parity", () => {
  let temporaryDirectory: string;
  let v1DbPath: string;
  let v2DbPath: string;
  let v1Sqlite: Database.Database;
  let v2Sqlite: Database.Database;
  let v1Database: Awaited<typeof import("@/db/Db.server")>;
  let v1Session: V1McpSession;
  let v2DiffSession: V2McpSession;
  let v2SharedSession: V2McpSession;

  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "janus-mcp-diff-"));
    v1DbPath = path.join(temporaryDirectory, "v1.sqlite");
    v2DbPath = path.join(temporaryDirectory, "v2.sqlite");

    process.env.DATABASE_URL = v1DbPath;
    v1Database = await import("@/db/Db.server");
    v1Database.migrateDb(path.resolve("drizzle"));

    v1Sqlite = openSqliteConnection(v1DbPath);
    v2Sqlite = openSqliteConnection(v2DbPath);
    runSqliteMigrations(v2Sqlite, path.resolve("drizzle"));

    resetAndSeedFixture(v1Sqlite, contract);
    resetAndSeedFixture(v2Sqlite, contract);

    const { mcpPostHandler } = await import("@/routes/mcp");
    v1Session = await startV1McpSession((request) => mcpPostHandler({ request }));
    v2DiffSession = await startV2McpSession(v2DbPath);
    v2SharedSession = await startV2McpSession(v1DbPath);
  }, 120_000);

  afterAll(async () => {
    await v2SharedSession?.close();
    await v2DiffSession?.close();
    await v1Session?.close();
    v2Sqlite?.close();
    v1Sqlite?.close();
    v1Database?.closeDb();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("matches tools/list metadata and schemas across v1 and v2 and gates all 19 pending tools", async () => {
    const [v1Listed, v2Listed] = await Promise.all([
      v1Session.rpc("tools/list"),
      v2DiffSession.rpc("tools/list"),
    ]);

    const v1Tools = new Map(
      ((v1Listed.result?.tools ?? []) as DeclaredTool[]).map((tool) => [tool.name, tool]),
    );
    const v2Tools = new Map(
      ((v2Listed.result?.tools ?? []) as DeclaredTool[]).map((tool) => [tool.name, tool]),
    );

    const expectedPortedNames = contract.tools.ported
      .map((tool) => tool.name)
      .sort((left, right) => left.localeCompare(right));
    const expectedAllV1Names = [...expectedPortedNames, ...contract.tools.pending].sort(
      (left, right) => left.localeCompare(right),
    );

    expect([...v1Tools.keys()].sort((left, right) => left.localeCompare(right))).toEqual(
      expectedAllV1Names,
    );
    expect([...v2Tools.keys()].sort((left, right) => left.localeCompare(right))).toEqual(
      expectedPortedNames,
    );

    for (const expected of contract.tools.ported) {
      const v1Tool = v1Tools.get(expected.name)!;
      const v2Tool = v2Tools.get(expected.name)!;

      expect(v2Tool.title, `${expected.name}.title`).toBe(v1Tool.title);
      expect(v2Tool.description, `${expected.name}.description`).toBe(v1Tool.description);
      expect(v2Tool.annotations, `${expected.name}.annotations`).toEqual(v1Tool.annotations);
      expect(canonicalizeSchema(v2Tool.inputSchema), `${expected.name}.inputSchema`).toEqual(
        canonicalizeSchema(v1Tool.inputSchema),
      );
      expect(canonicalizeSchema(v2Tool.outputSchema), `${expected.name}.outputSchema`).toEqual(
        canonicalizeSchema(v1Tool.outputSchema),
      );
    }

    for (const pendingTool of contract.tools.pending) {
      expect(v2Tools.has(pendingTool), `${pendingTool} must remain unported`).toBe(false);
      const response = await v2DiffSession.rpc("tools/call", {
        name: pendingTool,
        arguments: {},
      });
      expect(response.error?.code, `${pendingTool} must return -32601`).toBe(-32601);
    }
  });

  describe("differential tools/call and SQLite post-state parity", () => {
    for (const complianceCase of contract.cases) {
      it(`matches v1 and v2 for case: ${complianceCase.id}`, async () => {
        resetAndSeedFixture(v1Sqlite, contract, complianceCase.setupSql);
        resetAndSeedFixture(v2Sqlite, contract, complianceCase.setupSql);

        let v1Cursor: string | undefined;
        let v2Cursor: string | undefined;

        for (const [stepIndex, step] of complianceCase.steps.entries()) {
          const v1Arguments = resolveStepArguments(step.arguments, v1Cursor);
          const v2Arguments = resolveStepArguments(step.arguments, v2Cursor);

          const [v1Raw, v2Raw] = await Promise.all([
            v1Session.rpc("tools/call", { name: step.tool, arguments: v1Arguments }),
            v2DiffSession.rpc("tools/call", { name: step.tool, arguments: v2Arguments }),
          ]);

          const v1Canonical = canonicalizeRpcResponse(v1Raw);
          const v2Canonical = canonicalizeRpcResponse(v2Raw);

          expect(v1Canonical.kind, `${complianceCase.id}#${stepIndex} v1 kind`).toBe(
            step.expect.kind,
          );
          expect(v2Canonical.kind, `${complianceCase.id}#${stepIndex} v2 kind`).toBe(
            step.expect.kind,
          );

          if (step.expect.kind === "ok") {
            expect(v2Canonical.structured, `${complianceCase.id}#${stepIndex}`).toEqual(
              v1Canonical.structured,
            );
          }

          if (step.expect.kind === "toolError" && step.expect.errorContains) {
            expect(v1Canonical.errorText).toContain(step.expect.errorContains);
            expect(v2Canonical.errorText).toContain(step.expect.errorContains);
          }

          v1Cursor = extractCursor(v1Raw);
          v2Cursor = extractCursor(v2Raw);
        }

        if (complianceCase.mutating) {
          assertSqliteCheckRep(v1Sqlite, complianceCase.expectFullyRankedWatchlists);
          assertSqliteCheckRep(v2Sqlite, complianceCase.expectFullyRankedWatchlists);

          const v1State = canonicalizeSqliteSnapshot(
            snapshotSqliteState(v1Sqlite),
            fixtureTimestamps,
          );
          const v2State = canonicalizeSqliteSnapshot(
            snapshotSqliteState(v2Sqlite),
            fixtureTimestamps,
          );
          expect(v2State, `${complianceCase.id} SQLite post-state`).toEqual(v1State);
        }
      });
    }
  });

  describe("stateful cross-version interleaved sequences on a single shared SQLite DB", () => {
    for (const sequence of contract.statefulSequences) {
      it(`preserves invariants and parity across ${sequence.id}`, async () => {
        resetAndSeedFixture(v1Sqlite, contract);

        for (const [stepIndex, step] of sequence.steps.entries()) {
          if (step.actor === "both") {
            const [v1Raw, v2Raw] = await Promise.all([
              v1Session.rpc("tools/call", { name: step.tool, arguments: step.arguments }),
              v2SharedSession.rpc("tools/call", { name: step.tool, arguments: step.arguments }),
            ]);
            const v1Canonical = canonicalizeRpcResponse(v1Raw);
            const v2Canonical = canonicalizeRpcResponse(v2Raw);
            expect(v1Canonical.kind, `${sequence.id}#${stepIndex}`).toBe("ok");
            expect(v2Canonical, `${sequence.id}#${stepIndex}`).toEqual(v1Canonical);
            continue;
          }

          const target = step.actor === "v1" ? v1Session : v2SharedSession;
          const raw = await target.rpc("tools/call", {
            name: step.tool,
            arguments: step.arguments,
          });
          const canonical = canonicalizeRpcResponse(raw);
          expect(canonical.kind, `${sequence.id}#${stepIndex} (${step.actor})`).toBe("ok");

          if (step.mutating) {
            assertSqliteCheckRep(v1Sqlite, step.expectFullyRankedWatchlists);
          }
        }
      });
    }
  });
});
