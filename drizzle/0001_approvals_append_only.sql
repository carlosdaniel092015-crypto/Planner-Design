-- approvals is append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION approvals_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approvals es de solo inserción';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER approvals_no_update BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION approvals_block_mutation();
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_approved_version_id_fk" FOREIGN KEY ("approved_version_id") REFERENCES "project_versions"("id") ON DELETE SET NULL;
