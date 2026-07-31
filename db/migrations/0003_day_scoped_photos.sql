ALTER TABLE `photos` ADD `day` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `photos_day_idx` ON `photos` (`day`);--> statement-breakpoint
ALTER TABLE `photos` DROP COLUMN `x`;--> statement-breakpoint
ALTER TABLE `photos` DROP COLUMN `y`;
