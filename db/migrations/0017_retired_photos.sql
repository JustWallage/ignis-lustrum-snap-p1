CREATE TABLE `retired_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`day` integer NOT NULL,
	`r2_key` text,
	`content_type` text NOT NULL,
	`retired_at` integer NOT NULL,
	`retired_by` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`retired_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `retired_photos_day_idx` ON `retired_photos` (`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `retired_photos_key_idx` ON `retired_photos` (`r2_key`);