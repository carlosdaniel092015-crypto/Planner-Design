CREATE TABLE "pending_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"org_name" text,
	"password_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- Plan limits now apply without Stripe too. The installation's own organisation (the oldest) keeps Empresa, marked as assigned by the platform;
-- any other organisation with a paid plan but no Stripe subscription goes back to Gratis (a platform admin can assign it again).
UPDATE "organizations" SET "plan" = 'empresa', "plan_status" = 'manual' WHERE "id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC, "id" ASC LIMIT 1);--> statement-breakpoint
UPDATE "organizations" SET "plan" = 'gratis', "plan_status" = NULL WHERE "plan" <> 'gratis' AND "stripe_subscription_id" IS NULL AND ("plan_status" IS NULL OR "plan_status" NOT IN ('manual', 'active', 'trialing'));
