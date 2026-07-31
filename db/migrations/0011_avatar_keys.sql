ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_avatar_key_idx` ON `users` (`avatar_key`);--> statement-breakpoint
UPDATE `users` SET `avatar_key` = lower(hex(randomblob(8))) WHERE `avatar` IS NOT NULL;
