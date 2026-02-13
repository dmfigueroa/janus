import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";
import path from "path";
import fs from "fs";
import { consola } from "consola";

async function main() {
  consola.info("Running migrations...");
  try {
    // Resolve absolute path to ensure strict location regardless of execution context
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    consola.info(`Looking for migrations in: ${migrationsFolder}`);

    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found at: ${migrationsFolder}`);
    }

    // This will run migrations on the database, skipping the ones already applied
    await migrate(db, { migrationsFolder });
    consola.success("Migrations complete");
    process.exit(0);
  } catch (error) {
    consola.error("Migration failed", error);
    process.exit(1);
  }
}

main();
