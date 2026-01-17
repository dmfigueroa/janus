import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

async function main() {
  console.log("Running migrations...");
  try {
    // This will run migrations on the database, skipping the ones already applied
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations complete");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed", error);
    process.exit(1);
  }
}

main();
