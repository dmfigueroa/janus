CREATE TABLE `watchlist_import_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `sidequest_job_id` integer NOT NULL,
  `watchlist_id` integer NOT NULL,
  `media_type` text NOT NULL,
  `source` text NOT NULL,
  `title` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `total_items` integer DEFAULT 0 NOT NULL,
  `processed_items` integer DEFAULT 0 NOT NULL,
  `inserted_items` integer DEFAULT 0 NOT NULL,
  `message` text,
  `error` text,
  `started_at` text,
  `completed_at` text,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_import_jobs_sidequest_job_id` ON `watchlist_import_jobs` (`sidequest_job_id`);
--> statement-breakpoint
CREATE INDEX `watchlist_import_jobs_watchlist_created_at` ON `watchlist_import_jobs` (`watchlist_id`,`created_at`);
