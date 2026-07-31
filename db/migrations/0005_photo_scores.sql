CREATE TABLE `photo_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`ai_score` integer NOT NULL,
	`critique` text NOT NULL,
	`bonus_detected` integer NOT NULL,
	`bonus_reason` text NOT NULL,
	`ai_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_scores_photo_idx` ON `photo_scores` (`photo_id`);