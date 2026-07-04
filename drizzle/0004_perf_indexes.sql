CREATE INDEX "conversation_user_updated_at_idx" ON "conversation" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX "chat_message_conversation_created_idx" ON "chat_message" USING btree ("conversation_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "openprovider_api_key_user_created_idx" ON "openprovider_api_key" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "model_status_provider_status_checked_idx" ON "model_status" USING btree ("provider","status","checked_at");
