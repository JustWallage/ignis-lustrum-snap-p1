CREATE TABLE `bowser_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer NOT NULL,
	`marked_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bowser_days_day_idx` ON `bowser_days` (`day`);--> statement-breakpoint
ALTER TABLE `prizes` ADD `prize_set` text DEFAULT 'ordinary' NOT NULL;