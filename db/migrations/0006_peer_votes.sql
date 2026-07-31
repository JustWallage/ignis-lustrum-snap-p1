CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`voter_id` integer NOT NULL,
	`photo_id` integer NOT NULL,
	`day` integer NOT NULL,
	`rank` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `votes_voter_day_rank_idx` ON `votes` (`voter_id`,`day`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `votes_voter_photo_day_idx` ON `votes` (`voter_id`,`photo_id`,`day`);