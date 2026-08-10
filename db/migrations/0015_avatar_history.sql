CREATE TABLE `avatar_sprites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avatar_sprites_key_idx` ON `avatar_sprites` (`key`);--> statement-breakpoint
CREATE INDEX `avatar_sprites_user_idx` ON `avatar_sprites` (`user_id`);--> statement-breakpoint
ALTER TABLE `comments` ADD `subject_type` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `subject_id` integer;--> statement-breakpoint
CREATE INDEX `comments_subject_idx` ON `comments` (`subject_type`,`subject_id`);--> statement-breakpoint
INSERT INTO `avatar_sprites` (`user_id`, `key`, `content_type`, `created_at`) SELECT `id`, `avatar_key`, `avatar_content_type`, `avatar_updated_at` FROM `users` WHERE `avatar_key` IS NOT NULL AND `avatar_content_type` IS NOT NULL AND `avatar_updated_at` IS NOT NULL;--> statement-breakpoint
UPDATE `comments` SET `subject_type` = 'photo', `subject_id` = `photo_id`;
