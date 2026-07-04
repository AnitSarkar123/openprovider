CREATE TABLE "openprovider_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "openprovider_api_key" ADD CONSTRAINT "openprovider_api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "openprovider_api_key_hash_idx" ON "openprovider_api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "openprovider_api_key_user_idx" ON "openprovider_api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "openprovider_api_key_user_active_idx" ON "openprovider_api_key" USING btree ("user_id","revoked_at");
