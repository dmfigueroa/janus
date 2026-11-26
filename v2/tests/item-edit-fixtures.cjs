const assert = require("node:assert/strict");

const rejectItemTitle = (database) => {
  database.exec(
    "CREATE TRIGGER reject_item_title BEFORE UPDATE OF title ON watchlist_items WHEN NEW.id=101 BEGIN SELECT RAISE(ABORT, 'item edit trigger failure'); END",
  );
};

const editItemFromV1 = (database) => {
  database
    .prepare(
      "UPDATE watchlist_items SET title = ?, release_date = ?, poster_path = ? WHERE id = 103 AND watchlist_id = 41",
    )
    .run("Edited From V1", "2019-06-15", "/from-v1.jpg");
};

const checkV2EditedItems = (database) => {
  const watchlist = database
    .prepare("SELECT updated_at, last_watched_at, paused_at FROM watchlists WHERE id = 41")
    .get();
  assert.equal(watchlist.updated_at, "2020-01-01T12:30:00.000Z");
  assert.equal(watchlist.last_watched_at, null);
  assert.equal(watchlist.paused_at, null);

  const item101 = database
    .prepare("SELECT * FROM watchlist_items WHERE id = 101 AND watchlist_id = 41")
    .get();
  assert.equal(item101.title, "Trimmed From V2");
  assert.equal(item101.release_date, "2025");
  assert.equal(item101.poster_path, "https://images.example.com/v2-edited.jpg");
  assert.equal(item101.tmdb_id, "ep-1");
  assert.equal(item101.source, "tmdb");
  assert.equal(item101.media_type, "episode");
  assert.equal(item101.custom_rank, 2);
  assert.equal(item101.is_watched, null);
  assert.equal(item101.authors, JSON.stringify(["Écrivain", "著者"]));

  const item102 = database
    .prepare("SELECT * FROM watchlist_items WHERE id = 102 AND watchlist_id = 41")
    .get();
  assert.equal(item102.title, "Second");
  assert.equal(item102.release_date, null);
  assert.equal(item102.poster_path, null);
  assert.equal(item102.custom_rank, 1);
  assert.equal(item102.is_watched, 1);
};

module.exports = {
  rejectItemTitle,
  editItemFromV1,
  checkV2EditedItems,
};
