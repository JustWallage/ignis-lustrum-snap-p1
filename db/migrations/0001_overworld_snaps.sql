DELETE FROM `likes`;--> statement-breakpoint
DELETE FROM `comments`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`data` text NOT NULL,
	`content_type` text NOT NULL,
	`caption` text,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
