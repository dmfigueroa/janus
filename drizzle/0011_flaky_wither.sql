CREATE TABLE `lineup_watchlists` (
	`lineup_id` integer NOT NULL,
	`watchlist_id` integer NOT NULL,
	FOREIGN KEY (`lineup_id`) REFERENCES `lineups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_lineup_watchlist` ON `lineup_watchlists` (`lineup_id`,`watchlist_id`);--> statement-breakpoint
CREATE TABLE `lineups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`system_key` text,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`rank` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lineups_system_key_unique` ON `lineups` (`system_key`);