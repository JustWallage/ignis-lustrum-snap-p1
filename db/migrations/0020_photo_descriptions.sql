CREATE TABLE `photo_descriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_descriptions_photo_idx` ON `photo_descriptions` (`photo_id`);