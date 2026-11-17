// Bulk summary fixtures cycle through empty, partial and completed lists so
// summary tests cover all three states in both order modes.
const states = [
  { items: 0, watched: 0 },
  { items: 2, watched: 1 },
  { items: 2, watched: 2 },
];
const modes = ["release", "custom"];

const insertItems = (insertItem, watchlistId, state) => {
  for (let itemIndex = 0; itemIndex < state.items; itemIndex += 1) {
    insertItem.run(
      watchlistId * 100 + itemIndex,
      watchlistId,
      `bulk-${watchlistId}-${itemIndex}`,
      `Bulk item ${itemIndex}`,
      itemIndex + 1,
      `2020-0${itemIndex + 1}-01`,
      itemIndex < state.watched ? 1 : 0,
    );
  }
};

const bulkWatchlists = (database, count) => {
  const insertWatchlist = database.prepare(
    "INSERT INTO watchlists(name, item_order_mode) VALUES(?, ?)",
  );
  const insertItem = database.prepare(
    "INSERT INTO watchlist_items(id,watchlist_id,tmdb_id,source,media_type,title,custom_rank,release_date,is_watched) VALUES(?,?,?,'tmdb','movie',?,?,?,?)",
  );
  for (let index = 0; index < count; index += 1) {
    const watchlistId = Number(
      insertWatchlist.run(
        `Bulk list ${String(index).padStart(2, "0")}`,
        modes[index % modes.length],
      ).lastInsertRowid,
    );
    insertItems(insertItem, watchlistId, states[index % states.length]);
  }
};

module.exports = { bulkWatchlists };
