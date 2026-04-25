import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
