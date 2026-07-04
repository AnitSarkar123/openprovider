CREATE TABLE "model_status" (
	"model_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"checked_at" timestamp,
	"latency_ms" integer,
	"http_status" integer,
	"error_message" text,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "model_status_provider_idx" ON "model_status" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "model_status_status_idx" ON "model_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "model_status_checked_at_idx" ON "model_status" USING btree ("checked_at");--> statement-breakpoint
CREATE TABLE "model_status_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"provider" text,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"checked_count" integer DEFAULT 0 NOT NULL,
	"working_count" integer DEFAULT 0 NOT NULL,
	"failing_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE INDEX "model_status_run_started_at_idx" ON "model_status_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "model_status_run_provider_idx" ON "model_status_run" USING btree ("provider");
