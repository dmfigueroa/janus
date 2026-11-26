import path from "path";
import fs from "fs";
import { openSqliteConnection, runSqliteMigrations } from "./SqliteConnection.server.ts";

function resolveMigrationsFolder() {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  console.log(`Looking for migrations in: ${migrationsFolder}`);
  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found at: ${migrationsFolder}`);
  }
  return migrationsFolder;
}

function migrateDatabase(migrationsFolder: string) {
  const sqlite = openSqliteConnection(process.env.DATABASE_URL || "sqlite.db", {
    foreignKeys: false,
  });
  try {
    runSqliteMigrations(sqlite, migrationsFolder);
  } finally {
    sqlite.close();
  }
}

function main() {
  console.log("Running migrations...");
  try {
    migrateDatabase(resolveMigrationsFolder());
    console.log("Migrations complete");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed", error);
    process.exit(1);
  }
}

main();
