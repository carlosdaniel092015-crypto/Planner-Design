-- The app is now called just "Planner". Rename the organisation created by the seed only if it still has the
-- original name, so an organisation renamed on purpose is left alone.
UPDATE "organizations" SET "name" = 'Planner', "updated_at" = now() WHERE "name" = 'Stephanny Planner';
