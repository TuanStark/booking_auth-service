import { Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from './audit-log.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller()
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Internal endpoint — only reachable from within the cluster (API Gateway).
   * Protected by x-internal-secret header; never exposed through the public proxy.
   */
  @Post('internal/audit-logs')
  async createInternal(
    @Headers('x-internal-secret') secret: string,
    @Body() dto: CreateAuditLogDto,
    @Res() res: Response,
  ) {
    const expected = this.configService.get<string>('INTERNAL_SECRET');

    if (!expected || secret !== expected) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const log = await this.auditLogService.create(dto);
    return res.status(201).json(log);
  }

  /**
   * Admin-facing endpoint — JWT + ADMIN role enforced at API Gateway layer.
   * Proxied as: GET /auth/audit-logs → GET /auth/audit-logs (auth-service).
   */
  @Get('auth/audit-logs')
  async findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query);
  }
}
