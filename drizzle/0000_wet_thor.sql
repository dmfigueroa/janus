CREATE TABLE `watchlist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watchlist_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`parent_title` text,
	`season` integer,
	`episode` integer,
	`poster_path` text,
	`release_date` text,
	`vote_average` real,
	`runtime` integer,
	`is_watched` integer DEFAULT false,
	`added_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
