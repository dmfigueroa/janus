import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./Db.server";
import path from "path";
import fs from "fs";

async function main() {
  console.log("Running migrations...");
  try {
    // Resolve absolute path to ensure strict location regardless of execution context
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    console.log(`Looking for migrations in: ${migrationsFolder}`);

    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found at: ${migrationsFolder}`);
    }

    // This will run migrations on the database, skipping the ones already applied
    await migrate(getDb(), { migrationsFolder });
    console.log("Migrations complete");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed", error);
    process.exit(1);
  }
}

main();
