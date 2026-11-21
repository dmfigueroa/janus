const assert = require("node:assert/strict");

const releaseSql =
  "CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END, release_date ASC, id ASC";
const customSql = `CASE WHEN custom_rank IS NULL THEN 1 ELSE 0 END, custom_rank ASC, ${releaseSql}`;

const releaseTieBreaks = (database) => {
  database.prepare("UPDATE watchlists SET item_order_mode = 'release' WHERE id = 41").run();
  database.prepare("UPDATE watchlist_items SET custom_rank = NULL WHERE watchlist_id = 41").run();
  const insert = database.prepare(
    "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,parent_id,parent_title,episode,custom_rank,is_watched,authors,release_date,poster_path) VALUES(?,41,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  insert.run(
    104,
    "ep-3",
    "tmdb",
    "episode",
    "Same Day Tie",
    "show-1",
    "A Show",
    "3",
    null,
    0,
    null,
    "2020-01-02",
    null,
  );
  insert.run(
    105,
    "movie-empty-date",
    "tmdb",
    "movie",
    "Empty Date",
    null,
    null,
    null,
    null,
    0,
    null,
    "",
    null,
  );
  insert.run(
    106,
    "ep-4",
    "tmdb",
    "episode",
    "Next Year Watched",
    "show-1",
    "A Show",
    "4",
    null,
    1,
    null,
    "2021-03-03",
    null,
  );
};

const addUnrankedInRelease = (database) => {
  database
    .prepare(
      "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,custom_rank,is_watched,release_date) VALUES(107,41,'movie-unranked','tmdb','movie','Added In Release',NULL,0,'2019-01-01')",
    )
    .run();
};

const checkOrderModeV1Read = (database) => {
  const watchlist = database
    .prepare("SELECT item_order_mode, updated_at FROM watchlists WHERE id = 41")
    .get();
  assert.equal(watchlist.item_order_mode, "custom");
  assert.match(watchlist.updated_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const customRows = database
    .prepare(
      `SELECT id, custom_rank FROM watchlist_items WHERE watchlist_id = 41 ORDER BY ${customSql}`,
    )
    .all();
  assert.deepEqual(customRows, [
    { id: 105, custom_rank: 1 },
    { id: 101, custom_rank: 2 },
    { id: 104, custom_rank: 3 },
    { id: 102, custom_rank: 4 },
    { id: 106, custom_rank: 5 },
    { id: 103, custom_rank: 6 },
    { id: 107, custom_rank: null },
  ]);
  const releaseIds = database
    .prepare(`SELECT id FROM watchlist_items WHERE watchlist_id = 41 ORDER BY ${releaseSql}`)
    .all()
    .map((row) => row.id);
  assert.deepEqual(releaseIds, [107, 101, 104, 102, 106, 103, 105]);
};

module.exports = {
  releaseTieBreaks,
  addUnrankedInRelease,
  checkOrderModeV1Read,
};
