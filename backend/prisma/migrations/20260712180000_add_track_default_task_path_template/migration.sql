-- AlterTable
ALTER TABLE "course_tracks" ADD COLUMN "default_task_path_template_id" TEXT;

-- AddForeignKey
ALTER TABLE "course_tracks" ADD CONSTRAINT "course_tracks_default_task_path_template_id_fkey" FOREIGN KEY ("default_task_path_template_id") REFERENCES "task_path_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
