ALTER TABLE `watchlist_items` ADD `custom_rank` integer;--> statement-breakpoint
CREATE INDEX `by_watchlist_custom_rank` ON `watchlist_items` (`watchlist_id`,`custom_rank`);
