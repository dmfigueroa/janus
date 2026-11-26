const path = require("node:path");
const {
  openSqliteConnection,
  runSqliteMigrations,
} = require("../../src/db/SqliteConnection.server.ts");

const database = openSqliteConnection(process.argv[2]);
try {
  runSqliteMigrations(database, path.resolve(__dirname, "../../drizzle"));
} finally {
  database.close();
}
