-- AlterTable
ALTER TABLE "message_attachments" ADD COLUMN "file_object_id" TEXT;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_object_id_fkey" FOREIGN KEY ("file_object_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
