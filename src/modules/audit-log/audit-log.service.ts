import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import type { AdminAuditLog } from '@prisma/client';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAuditLogDto): Promise<AdminAuditLog> {
    return this.prisma.adminAuditLog.create({
      data: {
        adminId: dto.adminId,
        adminEmail: dto.adminEmail,
        action: dto.action,
        resource: dto.resource,
        resourceId: dto.resourceId,
        method: dto.method,
        path: dto.path,
        statusCode: dto.statusCode,
        metadata: dto.metadata !== undefined
          ? (dto.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ip: dto.ip,
        userAgent: dto.userAgent,
      },
    });
  }

  async findAll(query: QueryAuditLogDto) {
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const where: Record<string, unknown> = {};

    if (query.adminId) where.adminId = query.adminId;
    if (query.resource) where.resource = query.resource;
    if (query.action) where.action = query.action;

    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom) range.gte = new Date(query.dateFrom);
      if (query.dateTo) range.lte = new Date(query.dateTo);
      where.createdAt = range;
    }

    const [logs, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
