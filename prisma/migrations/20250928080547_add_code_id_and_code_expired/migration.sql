-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "codeExpired" TIMESTAMP(3),
ADD COLUMN     "codeId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
