export class CreateAuditLogDto {
  adminId: string;
  adminEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  path: string;
  statusCode: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}
