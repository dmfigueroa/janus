// Regenerate only after reconciling a v1 schema change with v2 compatibility.
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const path = require("node:path");
const database = new Database(":memory:");
migrate(drizzle(database), { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
const tables = ["watchlists", "watchlist_items", "lineups", "lineup_watchlists"];
const schema = Object.fromEntries(
  tables.map((table) => [
    table,
    {
      columns: database.prepare(`PRAGMA table_info(${table})`).all(),
      foreignKeys: database.prepare(`PRAGMA foreign_key_list(${table})`).all(),
      indexes: database
        .prepare(`PRAGMA index_list(${table})`)
        .all()
        .map((index) => ({
          ...index,
          columns: database.prepare(`PRAGMA index_info(${index.name})`).all(),
        })),
    },
  ]),
);
process.stdout.write(JSON.stringify(schema, null, 2) + "\n");
database.close();
