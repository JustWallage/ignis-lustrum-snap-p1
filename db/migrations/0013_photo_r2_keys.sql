ALTER TABLE `photos` ADD `r2_key` text;--> statement-breakpoint
UPDATE `photos` SET `r2_key` = 'snaps/' || `id`;
