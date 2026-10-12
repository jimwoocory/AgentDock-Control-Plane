CREATE TABLE `cp_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`node_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cp_approvals_project_node` ON `cp_approvals` (`project_id`,`node_id`);--> statement-breakpoint
CREATE TABLE `cp_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`node_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cp_artifacts_version` ON `cp_artifacts` (`project_id`,`node_id`,`name`,`version`);--> statement-breakpoint
CREATE TABLE `cp_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`node_id` text,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cp_decisions_project_node` ON `cp_decisions` (`project_id`,`node_id`);--> statement-breakpoint
CREATE TABLE `cp_project_links` (
	`source_project_id` text PRIMARY KEY NOT NULL,
	`target_project_id` text NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cp_project_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
