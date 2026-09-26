CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"segment_id" integer NOT NULL,
	"department" text NOT NULL,
	"asset_type" text NOT NULL,
	"label" text NOT NULL,
	"health" real DEFAULT 80 NOT NULL,
	"source_system" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"segment_id" integer NOT NULL,
	"day" integer DEFAULT 0 NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"departments" jsonb NOT NULL,
	"defect_ids" jsonb NOT NULL,
	"is_super_block" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'physical' NOT NULL,
	"window" text DEFAULT 'GOLDEN' NOT NULL,
	"delay_cost_min" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defect_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"defect_id" integer NOT NULL,
	"from_stage" text NOT NULL,
	"to_stage" text NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"actor_role" text DEFAULT 'SYSTEM' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defects" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"department" text NOT NULL,
	"source_system" text NOT NULL,
	"title" text NOT NULL,
	"severity" integer NOT NULL,
	"overdue_days" integer DEFAULT 0 NOT NULL,
	"duration_min" integer NOT NULL,
	"needs_line_block" boolean DEFAULT true NOT NULL,
	"needs_power_block" boolean DEFAULT false NOT NULL,
	"inspection_mode" text DEFAULT 'physical' NOT NULL,
	"failure_prob_72h" real DEFAULT 0.1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"defect_code" text DEFAULT '' NOT NULL,
	"lifecycle_status" text DEFAULT 'REPORTED' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"detailed_inspection" boolean DEFAULT false NOT NULL,
	"due_in_days" integer DEFAULT 7 NOT NULL,
	"recurrence_band" text DEFAULT 'NONE' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"long_term_maintenance" jsonb,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"defect_id" integer,
	"segment_id" integer NOT NULL,
	"department" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"chainage" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"team_leader" text,
	"window_start" integer,
	"window_end" integer,
	"is_super_block" boolean DEFAULT false NOT NULL,
	"report_photo" text DEFAULT '' NOT NULL,
	"report_gps" text DEFAULT '' NOT NULL,
	"report_at" timestamp DEFAULT now() NOT NULL,
	"before_photo" text,
	"before_gps" text,
	"before_at" timestamp,
	"after_photo" text,
	"after_gps" text,
	"after_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"horizon" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resilience_score" real DEFAULT 0 NOT NULL,
	"kpis" jsonb NOT NULL,
	"supersedes_id" integer,
	"trigger_note" text,
	"diff" jsonb
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"from_code" text NOT NULL,
	"to_code" text NOT NULL,
	"corridor" text NOT NULL,
	"length_km" real NOT NULL,
	"is_bridge" boolean DEFAULT false NOT NULL,
	"is_level_crossing" boolean DEFAULT false NOT NULL,
	"daily_trains" integer DEFAULT 50 NOT NULL,
	"criticality" integer DEFAULT 5 NOT NULL,
	"max_speed" integer DEFAULT 110 NOT NULL,
	CONSTRAINT "segments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'junction' NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"lat" real DEFAULT 0 NOT NULL,
	"lng" real DEFAULT 0 NOT NULL,
	"daily_trains" integer DEFAULT 0 NOT NULL,
	"vip_zone" boolean DEFAULT false NOT NULL,
	CONSTRAINT "stations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_items" ADD CONSTRAINT "block_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_items" ADD CONSTRAINT "block_items_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect_events" ADD CONSTRAINT "defect_events_defect_id_defects_id_fk" FOREIGN KEY ("defect_id") REFERENCES "public"."defects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE no action ON UPDATE no action;