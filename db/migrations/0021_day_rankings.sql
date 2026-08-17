CREATE TABLE `day_rankings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer NOT NULL,
	`run_stamp` integer NOT NULL,
	`status` text NOT NULL,
	`ran_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_rankings_day_idx` ON `day_rankings` (`day`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_photo_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`ai_score` real NOT NULL,
	`critique` text NOT NULL,
	`bonus_detected` integer NOT NULL,
	`bonus_reason` text NOT NULL,
	`ai_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_photo_scores`("id", "photo_id", "ai_score", "critique", "bonus_detected", "bonus_reason", "ai_status", "created_at") SELECT "id", "photo_id", "ai_score", "critique", "bonus_detected", "bonus_reason", "ai_status", "created_at" FROM `photo_scores`;--> statement-breakpoint
DROP TABLE `photo_scores`;--> statement-breakpoint
ALTER TABLE `__new_photo_scores` RENAME TO `photo_scores`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `photo_scores_photo_idx` ON `photo_scores` (`photo_id`);