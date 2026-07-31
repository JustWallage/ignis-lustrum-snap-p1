CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Seeded here rather than by scripts/seed.mjs, for the same reason `game_state` and
-- `SEED_PRIZES` are: every environment with the schema opens with the caps the code
-- compiled in before they were editable. A migration cannot import TypeScript, so these
-- two numbers exist twice; `worker/lib/avatar-caps.test.ts` holds them together.
INSERT INTO `settings` (`key`, `value`, `updated_at`) VALUES
	('avatar_daily_limit', 10, unixepoch()),
	('avatar_town_daily_limit', 50, unixepoch())
ON CONFLICT(`key`) DO NOTHING;
