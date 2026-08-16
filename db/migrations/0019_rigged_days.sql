CREATE TABLE `rigged_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer NOT NULL,
	`prize_id` integer NOT NULL,
	`rigged_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rigged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rigged_days_day_idx` ON `rigged_days` (`day`);