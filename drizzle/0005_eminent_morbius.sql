CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text NOT NULL
);
