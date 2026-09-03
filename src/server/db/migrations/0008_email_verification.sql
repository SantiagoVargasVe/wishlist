ALTER TABLE "password_reset_tokens" ADD COLUMN "purpose" text DEFAULT 'password_reset' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_purpose_valid" CHECK ("password_reset_tokens"."purpose" IN ('password_reset', 'email_verify'));