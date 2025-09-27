// config.service.ts
import { Injectable } from '@nestjs/common';

//Class đọc environment variables, cung cấp các method trả về config.
@Injectable()
export class ConfigService {
  get(key: string): string {
    return process.env[key] || '';
  }

  getPort(): number {
    return Number(this.get('PORT')) || 3000;
  }

  getJwtSecret(): string {
    return this.get('JWT_SECRET') || 'default_secret';
  }

  getDatabaseUrl(): string {
    return this.get('DATABASE_URL');
  }
}
