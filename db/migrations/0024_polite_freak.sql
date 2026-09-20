ALTER TABLE `photos` ADD `shared_publicly` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `public_veto` integer DEFAULT false NOT NULL;