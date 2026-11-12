// Run with the supported Node ABI; production migrations own this fixture schema.
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const path = require("node:path");
const database = new Database(process.argv[2]);
if (process.argv[3] === "release") {
  database.prepare("UPDATE watchlists SET item_order_mode = 'release' WHERE id = 41").run();
  database.close();
  process.exit(0);
}
if (process.argv[3] === "mutate") {
  database.prepare("UPDATE watchlist_items SET is_watched = 1 WHERE id = 101").run();
  database.close();
  process.exit(0);
}
if (process.argv[3] === "watch-all") {
  database.prepare("UPDATE watchlist_items SET is_watched = 1 WHERE watchlist_id = 41").run();
  database.close();
  process.exit(0);
}
if (process.argv[3] === "incompatible") {
  database.exec("ALTER TABLE watchlists ADD COLUMN unexpected TEXT");
  database.close();
  process.exit(0);
}
if (process.argv[3] === "wal") {
  database.pragma("journal_mode = WAL");
  database.close();
  process.exit(0);
}
migrate(drizzle(database), { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
database
  .prepare("INSERT INTO watchlists(id,name,description,item_order_mode) VALUES(41, ?, ?, 'custom')")
  .run("Café 東京 <collection>", "Existing v1 collection");
database
  .prepare(
    "UPDATE watchlists SET created_at = '2020-01-01 12:30:00', updated_at = '2020-01-01T12:30:00.000Z' WHERE id = 41",
  )
  .run();
database.prepare("INSERT INTO watchlists(id,name) VALUES(42, 'ΟΣ')").run();
const insert = database.prepare(
  "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,parent_id,parent_title,episode,custom_rank,is_watched,authors,release_date,poster_path) VALUES(?,41,?,?,?,?,?,?,?,?,?,?,?,?)",
);
insert.run(
  101,
  "ep-1",
  "tmdb",
  "episode",
  "Opening <script>",
  "show-1",
  "A Show",
  "1",
  2,
  null,
  JSON.stringify(["Écrivain", "著者"]),
  "2020-01-02",
  null,
);
insert.run(
  102,
  "ep-2",
  "tmdb",
  "episode",
  "Second",
  "show-1",
  "A Show",
  "2",
  1,
  1,
  null,
  "2020-02-02",
  "/poster.jpg",
);
insert.run(
  103,
  "book-1",
  "google_books",
  "book",
  "Last",
  null,
  null,
  null,
  null,
  0,
  "[]",
  null,
  "https://images.example/poster.jpg",
);
database.close();
