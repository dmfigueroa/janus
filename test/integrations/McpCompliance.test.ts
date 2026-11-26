import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSqliteConnection } from "@/db/SqliteConnection.server";
import {
  loadMcpContract,
  resetAndSeedFixture,
  resolveStepArguments,
  type ComplianceStep,
} from "@test/parity/McpContract";
import { assertSqliteCheckRep } from "@test/parity/SqliteCheckRep";
import { startV1McpSession, type V1McpSession } from "@test/parity/V1McpSession";
import type { RpcPayload } from "@test/parity/V2ServerProcess";

interface DeclaredTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
}

const contract = loadMcpContract();

function assertStepOutcome(
  caseId: string,
  stepIndex: number,
  step: ComplianceStep,
  payload: RpcPayload,
): string | undefined {
  if (step.expect.kind === "rpcInvalidParams") {
    expect(payload.error?.code, `${caseId}#${stepIndex}`).toBe(-32602);
    return undefined;
  }

  const result = payload.result;
  expect(result, `${caseId}#${stepIndex} payload: ${JSON.stringify(payload)}`).toBeDefined();

  if (step.expect.kind === "toolError") {
    expect(result?.isError, `${caseId}#${stepIndex}`).toBe(true);
    if (step.expect.errorContains) {
      const content = result?.content as Array<{ text?: string }> | undefined;
      expect(content?.[0]?.text ?? "").toContain(step.expect.errorContains);
    }
    return undefined;
  }

  expect(result?.isError, `${caseId}#${stepIndex}`).not.toBe(true);
  const structured = result?.structuredContent as Record<string, unknown> | undefined;
  expect(structured, `${caseId}#${stepIndex}`).toBeDefined();
  const content = result?.content as Array<{ text: string }>;
  expect(JSON.parse(content[0]!.text)).toEqual(structured);

  if (step.expect.hasCursor !== undefined) {
    expect(typeof structured?.nextCursor === "string", `${caseId}#${stepIndex}`).toBe(
      step.expect.hasCursor,
    );
  }
  if (step.expect.hasOrderToken !== undefined) {
    expect(
      typeof structured?.orderToken === "string" && structured.orderToken.startsWith("sha256:"),
      `${caseId}#${stepIndex}`,
    ).toBe(step.expect.hasOrderToken);
  }

  return typeof structured?.nextCursor === "string" ? structured.nextCursor : undefined;
}

describe("Janus v1 MCP contract compliance", () => {
  let temporaryDirectory: string;
  let databasePath: string;
  let adminSqlite: Database.Database;
  let database: Awaited<typeof import("@/db/Db.server")>;
  let session: V1McpSession;

  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "janus-v1-compliance-"));
    databasePath = path.join(temporaryDirectory, "v1.sqlite");
    process.env.DATABASE_URL = databasePath;

    database = await import("@/db/Db.server");
    database.migrateDb(path.resolve("drizzle"));
    adminSqlite = openSqliteConnection(databasePath);

    const { mcpPostHandler } = await import("@/routes/mcp");
    session = await startV1McpSession((request) => mcpPostHandler({ request }));
  });

  afterAll(async () => {
    await session?.close();
    adminSqlite?.close();
    database?.closeDb();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("declares the exact union of ported and pending tools with matching metadata", async () => {
    const listed = await session.rpc("tools/list");
    const tools = (listed.result?.tools ?? []) as DeclaredTool[];
    const declaredByName = new Map(tools.map((tool) => [tool.name, tool]));

    const expectedNames = [
      ...contract.tools.ported.map((tool) => tool.name),
      ...contract.tools.pending,
    ].sort((left, right) => left.localeCompare(right));
    const actualNames = [...declaredByName.keys()].sort((left, right) => left.localeCompare(right));

    expect(actualNames).toEqual(expectedNames);

    for (const expected of contract.tools.ported) {
      const actual = declaredByName.get(expected.name);
      expect(actual, expected.name).toBeDefined();
      expect(actual?.title, `${expected.name}.title`).toBe(expected.title);
      expect(actual?.description, `${expected.name}.description`).toBe(expected.description);
      expect(actual?.annotations, `${expected.name}.annotations`).toEqual(expected.annotations);
    }
  });

  for (const complianceCase of contract.cases) {
    it(`satisfies contract case: ${complianceCase.id}`, async () => {
      resetAndSeedFixture(adminSqlite, contract, complianceCase.setupSql);
      let previousCursor: string | undefined;

      for (const [stepIndex, step] of complianceCase.steps.entries()) {
        const resolvedArguments = resolveStepArguments(step.arguments, previousCursor);
        const payload = await session.rpc("tools/call", {
          name: step.tool,
          arguments: resolvedArguments,
        });
        previousCursor = assertStepOutcome(complianceCase.id, stepIndex, step, payload);
      }

      if (complianceCase.mutating) {
        assertSqliteCheckRep(adminSqlite, complianceCase.expectFullyRankedWatchlists);
      }
    });
  }
});
