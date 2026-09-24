ALTER TABLE "organizations" ADD COLUMN "plan" text DEFAULT 'gratis' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_renews_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
-- Organisations that already existed keep every feature they were using.
UPDATE "organizations" SET "plan" = 'empresa';
