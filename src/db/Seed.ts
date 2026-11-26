import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./Schema.ts";
import { openSqliteConnection } from "./SqliteConnection.server.ts";

const { watchlists, watchlistItems } = schema;

type MediaType = (typeof watchlistItems.$inferInsert)["mediaType"];

interface DemoItem {
  tmdbId: string;
  mediaType: MediaType;
  title: string;
  source?: string;
  releaseDate?: string | null;
  voteAverage?: number | null;
  runtime?: number | null;
  customRank?: number | null;
  isWatched?: boolean;
  authors?: string[] | null;
}

interface DemoWatchlist {
  name: string;
  description: string;
  itemOrderMode: "release" | "custom";
  items: DemoItem[];
}

function movie(
  tmdbId: string,
  title: string,
  releaseDate: string,
  voteAverage: number,
  runtime: number,
  isWatched = false,
): DemoItem {
  return { tmdbId, mediaType: "movie", title, releaseDate, voteAverage, runtime, isWatched };
}

function anime(
  tmdbId: string,
  title: string,
  releaseDate: string,
  voteAverage: number,
  isWatched = false,
): DemoItem {
  return { tmdbId, mediaType: "anime", title, releaseDate, voteAverage, runtime: 24, isWatched };
}

function manga(
  tmdbId: string,
  title: string,
  releaseDate: string,
  voteAverage: number,
  author: string,
): DemoItem {
  return {
    tmdbId,
    mediaType: "manga",
    title,
    releaseDate,
    voteAverage,
    source: "anilist",
    authors: [author],
  };
}

function book(
  tmdbId: string,
  title: string,
  releaseDate: string,
  voteAverage: number,
  rank: number,
  author: string,
  isWatched = false,
): DemoItem {
  return {
    tmdbId,
    mediaType: "book",
    title,
    releaseDate,
    voteAverage,
    source: "google_books",
    customRank: rank,
    authors: [author],
    isWatched,
  };
}

const demoWatchlists: DemoWatchlist[] = [
  {
    name: "Marvel Cinematic Universe",
    description: "Every MCU film in release order.",
    itemOrderMode: "release",
    items: [
      movie("tmdb-1726", "Iron Man", "2008-05-02", 7.6, 126, true),
      movie("tmdb-1724", "The Incredible Hulk", "2008-06-13", 6.6, 114, true),
      movie("tmdb-10138", "Iron Man 2", "2010-05-07", 6.8, 124, true),
      movie("tmdb-10195", "Thor", "2011-05-06", 7.0, 115, true),
      movie("tmdb-1771", "Captain America: The First Avenger", "2011-07-22", 7.0, 124, true),
      movie("tmdb-24428", "The Avengers", "2012-05-04", 7.7, 143, true),
      movie("tmdb-284054", "Black Panther", "2018-02-16", 7.4, 134),
      movie("tmdb-299534", "Avengers: Endgame", "2019-04-26", 8.3, 181),
      movie("tmdb-822119", "Captain America: Brave New World", "2025-02-14", 6.1, 118),
    ],
  },
  {
    name: "Star Wars",
    description: "The Skywalker saga and adjacent series.",
    itemOrderMode: "release",
    items: [
      movie("tmdb-11", "Star Wars", "1977-05-25", 8.2, 121, true),
      movie("tmdb-1891", "The Empire Strikes Back", "1980-05-21", 8.4, 124, true),
      movie("tmdb-1892", "Return of the Jedi", "1983-05-25", 8.0, 131, true),
      movie("tmdb-12180", "The Clone Wars", "2008-08-15", 6.9, 98),
      movie("tmdb-140607", "The Force Awakens", "2015-12-18", 7.3, 136),
      movie("tmdb-181808", "The Last Jedi", "2017-12-15", 6.9, 152),
      movie("tmdb-181812", "The Rise of Skywalker", "2019-12-20", 6.2, 142),
    ],
  },
  {
    name: "Anime & Manga",
    description: "A mixed anime and manga backlog.",
    itemOrderMode: "release",
    items: [
      anime("tmdb-37854", "One Piece", "1999-10-20", 8.7),
      anime("tmdb-1425", "Fullmetal Alchemist: Brotherhood", "2009-04-05", 8.9, true),
      anime("tmdb-1429", "Attack on Titan", "2013-04-07", 8.6),
      anime("tmdb-60625", "Demon Slayer: Kimetsu no Yaiba", "2019-04-06", 8.5),
      manga("manga-1", "Berserk", "1989-10-01", 9.1, "Kentaro Miura"),
      manga("manga-2", "Vagabond", "1998-09-17", 9.0, "Takehiko Inoue"),
      manga("manga-3", "Chainsaw Man", "2018-12-03", 8.6, "Tatsuki Fujimoto"),
    ],
  },
  {
    name: "Reading List",
    description: "Books in the order I plan to read them.",
    itemOrderMode: "custom",
    items: [
      book("book-1", "The Name of the Wind", "2007-03-27", 8.7, 1, "Patrick Rothfuss"),
      book("book-2", "The Way of Kings", "2010-08-31", 8.9, 2, "Brandon Sanderson"),
      book("book-3", "Dune", "1965-08-01", 8.4, 3, "Frank Herbert", true),
      book("book-4", "Project Hail Mary", "2021-05-04", 8.8, 4, "Andy Weir"),
    ],
  },
];

function main() {
  if (process.env.SEED_ON_STARTUP !== "true") {
    console.log('Seed skipped: SEED_ON_STARTUP is not "true".');
    return;
  }

  const sqlite = openSqliteConnection(process.env.DATABASE_URL || "sqlite.db");
  try {
    seedInto(sqlite);
  } finally {
    sqlite.close();
  }
}

function seedInto(sqlite: Database.Database) {
  const db = drizzle(sqlite, { schema });
  const existing = sqlite.prepare("SELECT COUNT(*) AS count FROM watchlists").get() as {
    count: number;
  };
  if (existing.count > 0) {
    console.log(`Seed skipped: ${existing.count} watchlist(s) already present.`);
    return;
  }

  const created = db.transaction(
    (transaction) =>
      demoWatchlists.map((demo) => {
        const inserted = transaction
          .insert(watchlists)
          .values({
            name: demo.name,
            description: demo.description,
            itemOrderMode: demo.itemOrderMode,
          })
          .returning({ id: watchlists.id })
          .get();

        const items = demo.items.map((item) => ({
          ...item,
          watchlistId: inserted.id,
          customRank: demo.itemOrderMode === "custom" ? item.customRank : null,
        }));
        transaction.insert(watchlistItems).values(items).run();

        return { id: inserted.id, name: demo.name, items: items.length };
      }),
    { behavior: "immediate" },
  );

  console.log(`Seeded ${created.length} watchlist(s):`);
  for (const entry of created) {
    console.log(`  - ${entry.name} (id ${entry.id}, ${entry.items} items)`);
  }
}

main();
