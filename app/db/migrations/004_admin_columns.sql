-- Admin-plugin columns required by Better Auth schema check.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" timestamp;
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "impersonatedBy" text;

--DOWN--
ALTER TABLE "session" DROP COLUMN IF EXISTS "impersonatedBy";
ALTER TABLE "user" DROP COLUMN IF EXISTS "banExpires";
ALTER TABLE "user" DROP COLUMN IF EXISTS "banReason";
ALTER TABLE "user" DROP COLUMN IF EXISTS "banned";
