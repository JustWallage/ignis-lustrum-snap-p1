CREATE TABLE `avatar_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`day` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avatar_generations_user_day_idx` ON `avatar_generations` (`user_id`,`day`);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_content_type` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_updated_at` integer;