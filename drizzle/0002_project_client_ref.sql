ALTER TABLE "projects" ADD COLUMN "client_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_client_ref_uq" ON "projects" USING btree ("organization_id","client_ref");