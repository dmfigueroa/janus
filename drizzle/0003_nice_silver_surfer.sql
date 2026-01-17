PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_watchlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_id` integer NOT NULL,
	`tmdb_id` text NOT NULL,
	`source` text DEFAULT 'tmdb' NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`parent_title` text,
	`season` integer,
	`episode` text,
	`poster_path` text,
	`release_date` text,
	`vote_average` real,
	`runtime` integer,
	`is_watched` integer DEFAULT false,
	`added_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_watchlist_items`("id", "watchlist_id", "tmdb_id", "source", "media_type", "title", "parent_title", "season", "episode", "poster_path", "release_date", "vote_average", "runtime", "is_watched", "added_at") SELECT "id", "watchlist_id", "tmdb_id", "source", "media_type", "title", "parent_title", "season", "episode", "poster_path", "release_date", "vote_average", "runtime", "is_watched", "added_at" FROM `watchlist_items`;--> statement-breakpoint
DROP TABLE `watchlist_items`;--> statement-breakpoint
ALTER TABLE `__new_watchlist_items` RENAME TO `watchlist_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_watchlist_item` ON `watchlist_items` (`watchlist_id`,`tmdb_id`,`media_type`);