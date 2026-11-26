// Regenerate only after reconciling a v1 schema change with v2 compatibility.
const path = require("node:path");
const {
  openSqliteConnection,
  runSqliteMigrations,
} = require("../../src/db/SqliteConnection.server.ts");
const database = openSqliteConnection(":memory:", { foreignKeys: false });
runSqliteMigrations(database, path.resolve(__dirname, "../../drizzle"));
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
