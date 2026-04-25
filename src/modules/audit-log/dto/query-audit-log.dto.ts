export class QueryAuditLogDto {
  page?: number;
  limit?: number;
  adminId?: string;
  resource?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}
