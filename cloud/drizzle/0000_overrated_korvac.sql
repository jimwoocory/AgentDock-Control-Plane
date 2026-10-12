CREATE TABLE `cp_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cp_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`node_id` text,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cp_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cp_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`goal` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cp_projects_name_unique` ON `cp_projects` (`name`);--> statement-breakpoint
CREATE TABLE `cp_snapshots` (
	`source_key` text PRIMARY KEY NOT NULL,
	`captured_at` text NOT NULL,
	`received_at` text NOT NULL,
	`payload` text NOT NULL
);
