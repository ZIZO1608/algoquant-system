-- AlterTable
ALTER TABLE "lead_sources" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;
