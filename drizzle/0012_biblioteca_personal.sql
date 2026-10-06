ALTER TABLE "materials" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "module_definitions" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_definitions" ADD CONSTRAINT "module_definitions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;