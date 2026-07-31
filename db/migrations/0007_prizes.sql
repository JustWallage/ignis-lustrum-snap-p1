CREATE TABLE `prizes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prizes_order_idx` ON `prizes` (`sort_order`);--> statement-breakpoint
-- Seeded here rather than by scripts/seed.mjs, so every environment with the schema
-- opens with a spinnable wheel. A migration cannot import TypeScript, so these are the
-- SQL half of `SEED_PRIZES`; worker/prizes.test.ts holds the two together.
INSERT INTO `prizes` (`label`, `enabled`, `sort_order`, `created_at`) VALUES
	('Als eerste bed uitkiezen', true, 0, unixepoch()),
	('Buddy voor de dag', true, 1, unixepoch()),
	('Bier wordt voor je gehaald', true, 2, unixepoch()),
	('Tas wordt gedragen', true, 3, unixepoch());
