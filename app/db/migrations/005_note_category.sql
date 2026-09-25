-- Agent category suggestion (nullable: older notes carry no suggestion).
ALTER TABLE assistant_notes ADD COLUMN IF NOT EXISTS suggested_category text;

--DOWN--
ALTER TABLE assistant_notes DROP COLUMN IF EXISTS suggested_category;
