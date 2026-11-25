CREATE TABLE `voice_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`companion_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`mime_type` text NOT NULL,
	`audio` blob,
	`transcript` text,
	`draft` text,
	`event_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `daily_events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `voice_captures_queue_idx` ON `voice_captures` (`user_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `daily_events` ADD `amount_grams` real;