// Run with the supported Node ABI; production migrations own this fixture schema.
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");
const { migrate } = require("drizzle-orm/better-sqlite3/migrator");
const path = require("node:path");
const database = new Database(process.argv[2]);
const customOrder = "ORDER BY custom_rank IS NULL, custom_rank, id";
const watchlistItemIds = (watchlistId) =>
  database
    .prepare(`SELECT id FROM watchlist_items WHERE watchlist_id=? ${customOrder}`)
    .all(watchlistId)
    .map((row) => row.id);
const watchlistItemRanks = (watchlistId) =>
  database
    .prepare(`SELECT id, custom_rank FROM watchlist_items WHERE watchlist_id=? ${customOrder}`)
    .all(watchlistId);

const actions = {
  "check-reorder"() {
    assert.deepEqual(watchlistItemIds(41), [101, 103, 102]);
    database.prepare("UPDATE watchlist_items SET custom_rank=0 WHERE id=102").run();
  },
  "reject-rank"() {
    database.exec(
      "CREATE TRIGGER reject_rank BEFORE UPDATE OF custom_rank ON watchlist_items WHEN NEW.id=102 BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
  },
  gapped() {
    database
      .prepare("INSERT INTO watchlists(id,name,item_order_mode) VALUES(43, 'Gapped', 'custom')")
      .run();
    const insert = database.prepare(
      "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,custom_rank,release_date) VALUES(?,43,?,'tmdb','movie',?,?,?)",
    );
    [
      [201, "g-1", "First", 1, "2020-01-01"],
      [202, "g-2", "Second", 10, "2020-02-01"],
      [203, "g-3", "Third", 11, "2020-03-01"],
      [204, "g-4", "Fourth", 12, "2020-04-01"],
    ].forEach(([id, tmdbId, title, rank, releaseDate]) =>
      insert.run(id, tmdbId, title, rank, releaseDate),
    );
  },
  "check-gapped-reorder"() {
    assert.deepEqual(watchlistItemRanks(43), [
      { id: 201, custom_rank: 1 },
      { id: 202, custom_rank: 2 },
      { id: 204, custom_rank: 3 },
      { id: 203, custom_rank: 4 },
    ]);
  },
  release() {
    database.prepare("UPDATE watchlists SET item_order_mode = 'release' WHERE id = 41").run();
  },
  mutate() {
    database.prepare("UPDATE watchlist_items SET is_watched = 1 WHERE id = 101").run();
  },
  "watch-all"() {
    database.prepare("UPDATE watchlist_items SET is_watched = 1 WHERE watchlist_id = 41").run();
  },
  "check-web-created"() {
    const row = database.prepare("SELECT * FROM watchlists WHERE name = 'From v2'").get();
    assert.ok(row, "v2-created watchlist is readable after reopening through v1 tooling");
    assert.equal(row.description, "");
    assert.equal(row.item_order_mode, "release");
    assert.equal(row.paused_at, null);
    assert.equal(row.updated_at, null);
    assert.match(row.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.match(row.last_watched_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    const htmx = database.prepare("SELECT * FROM watchlists WHERE name = 'HTMX created'").get();
    assert.ok(htmx, "HTMX-created watchlist is readable after reopening through v1 tooling");
    assert.equal(htmx.description, "");
    assert.equal(htmx.item_order_mode, "custom");
  },
  "check-mcp-created"() {
    const row = database.prepare("SELECT * FROM watchlists WHERE name = 'MCP created'").get();
    assert.ok(row, "MCP-created watchlist is readable after reopening through v1 tooling");
    assert.equal(row.description, null);
    assert.equal(row.item_order_mode, "release");
    assert.equal(row.paused_at, null);
    assert.ok(row.updated_at, "MCP update must set the Drizzle-compatible updated timestamp");
  },
  many() {
    const insert = database.prepare("INSERT INTO watchlists(name) VALUES(?)");
    for (let index = 0; index < 60; index += 1) {
      insert.run(`Bulk list ${String(index).padStart(2, "0")}`);
    }
  },
  incompatible() {
    database.exec("ALTER TABLE watchlists ADD COLUMN unexpected TEXT");
  },
  wal() {
    database.pragma("journal_mode = WAL");
  },
};
const requestedAction = process.argv[3];
const action = actions[requestedAction];
if (requestedAction && !action) {
  throw new Error(`Unknown fixture action: ${requestedAction}`);
}
if (action) {
  action();
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
