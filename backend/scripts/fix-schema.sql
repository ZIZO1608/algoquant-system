ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "course_tracks" DROP CONSTRAINT IF EXISTS "course_tracks_default_task_path_template_id_fkey";
ALTER TABLE "course_tracks" DROP COLUMN IF EXISTS "default_task_path_template_id";
