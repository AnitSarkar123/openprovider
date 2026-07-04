CREATE TABLE "api_usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"key_prefix" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"workflow" text NOT NULL,
	"requested_model" text,
	"routed_model" text,
	"provider" text,
	"status_code" integer NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"error_type" text,
	"token_usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage_event" ADD CONSTRAINT "api_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_usage_event" ADD CONSTRAINT "api_usage_event_api_key_id_openprovider_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."openprovider_api_key"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "api_usage_event_user_created_idx" ON "api_usage_event" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "api_usage_event_key_created_idx" ON "api_usage_event" USING btree ("api_key_id","created_at");
--> statement-breakpoint
CREATE INDEX "api_usage_event_model_idx" ON "api_usage_event" USING btree ("user_id","routed_model");
--> statement-breakpoint
CREATE INDEX "api_usage_event_provider_idx" ON "api_usage_event" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX "api_usage_event_workflow_idx" ON "api_usage_event" USING btree ("user_id","workflow");
