CREATE TABLE `prize_awards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer NOT NULL,
	`user_id` integer NOT NULL,
	`prize_label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prize_awards_day_idx` ON `prize_awards` (`day`);