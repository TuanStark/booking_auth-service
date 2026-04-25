-- CreateTable
CREATE TABLE "public"."admin_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "admin_email" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_idx" ON "public"."admin_audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_resource_idx" ON "public"."admin_audit_logs"("resource");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "public"."admin_audit_logs"("created_at");
