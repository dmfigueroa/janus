#!/usr/bin/env node
/**
 * Seeds a deterministic SQLite database with large watchlists so the timeline can be
 * profiled under a repeatable dataset. The database is disposable: delete it and rerun.
 *
 * Usage:
 *   node tools/bench/SeedTimelineFixture.mjs --database /tmp/janus-timeline-bench.sqlite
 *   node tools/bench/SeedTimelineFixture.mjs --database /tmp/janus-timeline-bench.sqlite --items 2000
 *
 * Prints the watchlist ids and the sample counts that the measurement script uses.
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { openSqliteConnection, runSqliteMigrations } from "../../src/db/SqliteConnection.server.ts";

const { values } = parseArgs({
  options: {
    database: { type: "string", default: "/tmp/janus-timeline-bench.sqlite" },
    items: { type: "string", default: "2000" },
    seed: { type: "string", default: "20240101" },
  },
});

const itemCount = Number.parseInt(values.items, 10);
const seed = Number.parseInt(values.seed, 10);
const databasePath = path.resolve(values.database);

const random = createRandom(seed);

const fixtures = [
  {
    name: "Benchmark Release",
    itemOrderMode: "release",
    mediaTypes: ["movie", "episode", "episode", "comic"],
    count: itemCount,
  },
  {
    name: "Benchmark Custom",
    itemOrderMode: "custom",
    mediaTypes: ["movie", "episode"],
    count: itemCount,
  },
  {
    name: "Benchmark Comics",
    itemOrderMode: "release",
    mediaTypes: ["comic"],
    count: Math.max(1, Math.round(itemCount / 4)),
  },
];

const sqlite = openSqliteConnection(databasePath, { foreignKeys: false });
const db = drizzle(sqlite);
runSqliteMigrations(sqlite, path.resolve(process.cwd(), "drizzle"));

sqlite.exec("DELETE FROM watchlist_items; DELETE FROM watchlists;");

const insertWatchlist = sqlite.prepare(
  "INSERT INTO watchlists (name, description, item_order_mode) VALUES (?, ?, ?)",
);
const insertItem = sqlite.prepare(`
  INSERT INTO watchlist_items (
    watchlist_id, tmdb_id, source, media_type, title, parent_id, parent_title,
    season, episode, poster_path, release_date, vote_average, runtime, custom_rank,
    is_watched, authors, added_at
  ) VALUES (
    @watchlistId, @tmdbId, @source, @mediaType, @title, @parentId, @parentTitle,
    @season, @episode, @posterPath, @releaseDate, @voteAverage, @runtime, @customRank,
    @isWatched, @authors, @addedAt
  )
`);

const results = db.transaction(() => {
  return fixtures.map((fixture) => {
    const inserted = insertWatchlist.run(
      fixture.name,
      "Timeline profiling fixture",
      fixture.itemOrderMode,
    );
    const watchlistId = Number(inserted.lastInsertRowid);
    const items = buildItems(fixture);

    sqlite.transaction(() => {
      items.forEach((item) => insertItem.run({ watchlistId, ...item }));
    })();
    touchWatchlist(sqlite, watchlistId);

    return {
      id: watchlistId,
      name: fixture.name,
      itemOrderMode: fixture.itemOrderMode,
      items: items.length,
    };
  });
});

console.log(JSON.stringify({ database: databasePath, fixtures: results }, null, 2));
sqlite.close();

function touchWatchlist(database, watchlistId) {
  database
    .prepare(
      "UPDATE watchlists SET last_item_added_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .run(watchlistId);
}

function buildItems(fixture) {
  const titles = buildTitles(fixture.mediaTypes);
  return Array.from({ length: fixture.count }, (_, index) => buildItem(fixture, titles, index));
}

function buildItem(fixture, titles, index) {
  const mediaType = fixture.mediaTypes[index % fixture.mediaTypes.length];
  const title = titles[index % titles.length];
  const releaseDate = randomReleaseDate(index);
  const customRank = fixture.itemOrderMode === "custom" ? fixture.count - index : index + 1;
  return {
    tmdbId: `bench-${fixture.itemOrderMode}-${index}`,
    source: mediaType === "comic" ? "comicvine" : "tmdb",
    mediaType,
    title: `${title} ${index + 1}`,
    parentId: mediaType === "episode" ? `bench-series-${index % 40}` : null,
    parentTitle: mediaType === "episode" ? `Benchmark Series ${(index % 40) + 1}` : null,
    season: mediaType === "episode" ? (index % 8) + 1 : null,
    episode: mediaType === "episode" ? String((index % 24) + 1) : null,
    posterPath: null,
    releaseDate,
    voteAverage: Math.round(random() * 40) / 10 + 4,
    runtime: mediaType === "episode" ? 20 + (index % 40) : 90 + (index % 80),
    customRank,
    isWatched: index % 3 === 0 ? 1 : 0,
    authors:
      mediaType === "comic" ? JSON.stringify(["Benchmark Author", `Co-Author ${index % 7}`]) : null,
    addedAt: "2024-01-01 00:00:00",
  };
}

function randomReleaseDate(index) {
  if (index % 37 === 0) {
    return null;
  }
  const year = 1980 + Math.floor(random() * 47);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildTitles(mediaTypes) {
  const suffix = mediaTypes.includes("comic")
    ? "Annual Collected Edition With A Deliberately Long Title"
    : "";
  return [
    "Benchmark Movie",
    "Benchmark Episode",
    "Benchmark Comic Issue",
    "Harbor Lights",
    "The Long Quiet Road Home",
    "Kestrel & Crane",
    "Night Shift at the Archive",
    `Impossibly Long Title That Wraps Across Multiple Lines ${suffix}`.trim(),
    "Übermorgen",
    "無題の作品",
    "A",
  ];
}

function createRandom(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
