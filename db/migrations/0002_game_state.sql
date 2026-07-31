CREATE TABLE `game_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`day` integer DEFAULT 1 NOT NULL,
	`phase` text DEFAULT 'submission' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `game_state` (`id`, `updated_at`) VALUES (1, unixepoch()) ON CONFLICT(`id`) DO NOTHING;
