import process from "node:process";
import { parseArgs } from "node:util";
import { scrubSqliteOrphans } from "./ScrubOrphans.server.ts";

function resolveDatabasePath(cliDatabase: string | undefined): string {
  return cliDatabase || process.env.DATABASE_URL || "sqlite.db";
}

function main() {
  try {
    const { values } = parseArgs({
      options: {
        database: { type: "string" },
        apply: { type: "boolean", default: false },
      },
    });
    const databasePath = resolveDatabasePath(values.database);
    const report = scrubSqliteOrphans(databasePath, { apply: values.apply });
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Orphan scrub failed", error);
    process.exit(1);
  }
}

main();
