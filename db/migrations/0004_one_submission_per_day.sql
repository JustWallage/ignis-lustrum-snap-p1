DELETE FROM `likes` WHERE `photo_id` IN (SELECT `id` FROM `photos` WHERE `id` NOT IN (SELECT MAX(`id`) FROM `photos` GROUP BY `user_id`, `day`));--> statement-breakpoint
DELETE FROM `comments` WHERE `photo_id` IN (SELECT `id` FROM `photos` WHERE `id` NOT IN (SELECT MAX(`id`) FROM `photos` GROUP BY `user_id`, `day`));--> statement-breakpoint
DELETE FROM `photos` WHERE `id` NOT IN (SELECT MAX(`id`) FROM `photos` GROUP BY `user_id`, `day`);--> statement-breakpoint
CREATE UNIQUE INDEX `photos_user_day_idx` ON `photos` (`user_id`,`day`);
