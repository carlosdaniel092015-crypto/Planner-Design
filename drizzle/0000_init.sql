CREATE TYPE "public"."currency" AS ENUM('USD', 'DOP');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('aprobado', 'cambios');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('render', 'pdf', 'dxf', 'csv', 'textura', 'modelo3d', 'hdri', 'miniatura', 'otro');--> statement-breakpoint
CREATE TYPE "public"."grain" AS ENUM('v', 'h', 'ninguna');--> statement-breakpoint
CREATE TYPE "public"."material_kind" AS ENUM('madera', 'solido', 'piedra', 'metal', 'vidrio');--> statement-breakpoint
CREATE TYPE "public"."material_source" AS ENUM('estandar', 'subido');--> statement-breakpoint
CREATE TYPE "public"."module_source" AS ENUM('parametrico', 'modelo3d');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('borrador', 'diseno', 'enviado', 'cambios_solicitados', 'aprobado');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('cocina', 'closet');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'disenador', 'taller', 'lectura');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('reset', 'invite');--> statement-breakpoint
CREATE TABLE "approval_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"recipient_email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"link_id" uuid,
	"decision" "approval_decision" NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text,
	"comment" text,
	"ip" "inet",
	"user_agent" text,
	"snapshot_sha256" text NOT NULL,
	"pdf_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dop_per_usd" numeric(12, 4) NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" "file_kind" NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"width" integer,
	"height" integer,
	"name" text NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardware_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"price_currency" "currency" DEFAULT 'USD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"kind" "material_kind" NOT NULL,
	"type_label" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#b0a898' NOT NULL,
	"uses" text[] DEFAULT '{}'::text[] NOT NULL,
	"base_color_file_id" uuid,
	"normal_file_id" uuid,
	"roughness_file_id" uuid,
	"ao_file_id" uuid,
	"metalness_file_id" uuid,
	"thumbnail_url" text,
	"size_w_cm" numeric(8, 2),
	"size_h_cm" numeric(8, 2),
	"grain" "grain" DEFAULT 'ninguna' NOT NULL,
	"rotation" numeric(6, 2) DEFAULT 0 NOT NULL,
	"thickness" numeric(6, 2) DEFAULT 1.8 NOT NULL,
	"roughness" numeric(4, 3),
	"clearcoat" numeric(4, 3),
	"price_m2" numeric(12, 2) DEFAULT 0 NOT NULL,
	"price_currency" "currency" DEFAULT 'USD' NOT NULL,
	"supplier_code" text,
	"source" "material_source" DEFAULT 'estandar' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"project_type" "project_type" NOT NULL,
	"source" "module_source" DEFAULT 'parametrico' NOT NULL,
	"row" text NOT NULL,
	"category" text NOT NULL,
	"kind" text NOT NULL,
	"min_w" numeric(8, 2) NOT NULL,
	"max_w" numeric(8, 2) NOT NULL,
	"def_w" numeric(8, 2) NOT NULL,
	"fixed_h" numeric(8, 2) NOT NULL,
	"fixed_d" numeric(8, 2) NOT NULL,
	"doors" smallint DEFAULT 0 NOT NULL,
	"drawers" smallint DEFAULT 0 NOT NULL,
	"recipe" jsonb,
	"model_file_id" uuid,
	"footprint" jsonb,
	"anchor" jsonb,
	"material_slots" jsonb,
	"unit_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"price_currency" "currency" DEFAULT 'USD' NOT NULL,
	"use_in_autolayout" boolean DEFAULT true NOT NULL,
	"thumbnail_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"brand_color" text,
	"base_currency" "currency" DEFAULT 'USD' NOT NULL,
	"exchange_rate_dop_per_usd" numeric(12, 4) DEFAULT 60 NOT NULL,
	"rate_updated_at" timestamp with time zone,
	"tax_name" text DEFAULT 'ITBIS' NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT 0.18 NOT NULL,
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"waste_rate" numeric(5, 4) DEFAULT 0.15 NOT NULL,
	"margin_rate" numeric(5, 4) DEFAULT 0 NOT NULL,
	"rounding" text DEFAULT 'ninguno' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"estimate" numeric(14, 2) NOT NULL,
	"estimate_currency" "currency" NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"type" "project_type" NOT NULL,
	"status" "project_status" DEFAULT 'borrador' NOT NULL,
	"phase" smallint DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"estimate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"estimate_currency" "currency" DEFAULT 'USD' NOT NULL,
	"module_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cover_url" text,
	"approved_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'disenador' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "approval_links" ADD CONSTRAINT "approval_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_links" ADD CONSTRAINT "approval_links_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_links" ADD CONSTRAINT "approval_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_link_id_approval_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."approval_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_prices" ADD CONSTRAINT "hardware_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_base_color_file_id_files_id_fk" FOREIGN KEY ("base_color_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_normal_file_id_files_id_fk" FOREIGN KEY ("normal_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_roughness_file_id_files_id_fk" FOREIGN KEY ("roughness_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_ao_file_id_files_id_fk" FOREIGN KEY ("ao_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_metalness_file_id_files_id_fk" FOREIGN KEY ("metalness_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_definitions" ADD CONSTRAINT "module_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_definitions" ADD CONSTRAINT "module_definitions_model_file_id_files_id_fk" FOREIGN KEY ("model_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_links_project_idx" ON "approval_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "approvals_project_idx" ON "approvals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_idx" ON "audit_log" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "exchange_rates_org_idx" ON "exchange_rates" USING btree ("organization_id","valid_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "files_project_idx" ON "files" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_prices_org_code_uq" ON "hardware_prices" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_org_code_uq" ON "materials" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "module_definitions_org_code_uq" ON "module_definitions" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "project_versions_project_idx" ON "project_versions" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "projects_org_updated_idx" ON "projects" USING btree ("organization_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "projects_org_status_idx" ON "projects" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "projects_data_gin_idx" ON "projects" USING gin ("data");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");