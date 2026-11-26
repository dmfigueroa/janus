function sqliteContractActions(database) {
  return {
    "rollback-journal"() {
      database.pragma("journal_mode = DELETE");
    },
    "orphan-lineup-watchlist"() {
      database.pragma("foreign_keys = OFF");
      database
        .prepare(
          "INSERT INTO lineups(id, kind, name, rank) VALUES(1, 'custom', 'Custom Lineup', 0)",
        )
        .run();
      database
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(1, 999999)")
        .run();
    },
    "orphan-lineup-parent"() {
      database.pragma("foreign_keys = OFF");
      database
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(999999, 41)")
        .run();
    },
    "orphan-watchlist-item"() {
      database.pragma("foreign_keys = OFF");
      database
        .prepare(
          "INSERT INTO watchlist_items(id, watchlist_id, tmdb_id, source, media_type, title) VALUES(999, 999999, 'orphan-1', 'tmdb', 'movie', 'Orphan')",
        )
        .run();
    },
    "invalid-is-watched"() {
      database.prepare("UPDATE watchlist_items SET is_watched = 2 WHERE id = 101").run();
    },
    "v1-cascading-deletes"() {
      database
        .prepare("INSERT INTO lineups(id, kind, name, rank) VALUES(10, 'custom', 'Weekend', 0)")
        .run();
      database
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(10, 41)")
        .run();
      database
        .prepare("INSERT INTO lineup_watchlists(lineup_id, watchlist_id) VALUES(10, 42)")
        .run();
      database.prepare("DELETE FROM watchlists WHERE id = 41").run();
      database.prepare("DELETE FROM lineups WHERE id = 10").run();
    },
  };
}

module.exports = { sqliteContractActions };
