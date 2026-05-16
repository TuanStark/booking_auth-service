import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthDTO } from './dto/index.js';
import * as argon from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/user/user.service';
import { CurrentUser } from './types/current-user.js';
// import * as dayjs from 'dayjs';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { hashToken } from '../../shared/utils/token.util.js';
import { RabbitMQProducerService } from '../../messaging/rabbitmq/rabbitmq.producer.service';
import { RedisService } from '@/messaging/redis/redis.service';
import { RabbitMQTopics } from '../../messaging/rabbitmq/rabbitmq.topic';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private userService: UserService,
    private rabbitMQProducerService: RabbitMQProducerService,
    private redisService: RedisService,
  ) {}

  async register(dto: AuthDTO) {
    const { password, name, studentId, phone } = dto;
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existingUser) {
      throw new ForbiddenException('Email đã được sử dụng');
    }

    const hash = await argon.hash(password);
    const codeId = uuidv4();
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hash,
          name: name || '',
          studentId: studentId ?? undefined,
          phone: phone ?? undefined,
          roleId: 'cb8d828d-c0b9-460f-8b30-f7de4152e84f',
          status: 'unactive',
          codeId: codeId,
          codeExpired: dayjs().add(10, 'minute').toDate(),
        } as Prisma.UserUncheckedCreateInput,
      });
      await this.rabbitMQProducerService.publishMessage(
        RabbitMQTopics.CREATE_USER,
        {
          id: user.id,
          email: user.email,
          password: user.password,
          name: name || '',
          roleId: user.roleId || 'cb8d828d-c0b9-460f-8b30-f7de4152e84f',
          codeId: user.codeId || '',
          codeExpired: user.codeExpired || dayjs().add(5, 'minute').toDate(),
        },
      );
      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ForbiddenException('Email đã được sử dụng');
      }
      throw error;
    }
  }

  async login(loginDto: { email: string; password: string }, ip?: string, userAgent?: string) {
    const user = await this.validateUser(
      loginDto.email.trim().toLowerCase(),
      loginDto.password,
    );
    if (!user) {
      throw new ForbiddenException('Invalid credentials');
    }
    if (user.status !== 'active') {
      throw new BadRequestException({
        code: 'EMAIL_NOT_VERIFIED',
        userId: user.id,
        email: user.email,
      });
    }
    const token = await this.createSessionForUser(user, ip || null, userAgent || null);
    return token;
  }

  /** Claims shared by access JWT (RS256) and legacy signJwtToken payloads. */
  private buildAccessTokenPayload(user: any, roleName: string) {
    const roleId =
      user.roleId ??
      (user.role && typeof user.role === 'object' ? user.role.id : undefined);
    return {
      sub: user.id,
      email: user.email,
      roleId,
      roleName,
      role: roleName,
    };
  }

  //now convert to an object, not string
  async signJwtToken(
    user,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const roleName = await this.resolveRoleNameForJwt(user);
    const payload = this.buildAccessTokenPayload(user, roleName);

    console.log('JWT Payload:', payload);

    // Generate access token (short-lived)
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1d',
      algorithm: 'RS256',
    });

    // Generate refresh token (long-lived)
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
      algorithm: 'RS256',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      // Verify the refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });

      // Extract user info from payload
      const userId = payload.sub;
      const email = payload.email;

      // Find the user to ensure they still exist
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { role: true },
      });

      if (!user || user.email !== email) {
        throw new ForbiddenException('Access denied');
      }

      // Generate new tokens
      return this.signJwtToken(user);
    } catch (error) {
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  async validateUser(email: string, password: string) {
    try {
      const user = await this.userService.findByEmail(email);
      if (!user) {
        this.logger.debug('Login attempt rejected: no matching user');
        return null;
      }

      const isPasswordValid = await argon.verify(user.password, password);
      if (!isPasswordValid) {
        return null;
      }

      // Return user without password
      const { password: _, ...result } = user;
      return user;
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  async validateJwtUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedException('User not found!');
    const currentUser: CurrentUser = { id: user.id, role: user.roleId };
    return currentUser;
  }

  async handleActive(codeId: string, id: string) {
    // findFirst: (id, codeId) không phải compound unique nên không dùng findUnique
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        codeId,
      },
    });
    if (!user) {
      throw new BadRequestException('Mã xác thực không đúng hoặc đã hết hạn');
    }
    const isBeforeCheck = dayjs().isBefore(user.codeExpired);
    if (!isBeforeCheck) {
      throw new BadRequestException('Mã xác thực đã hết hạn');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'active',
      },
    });
    return user;
  }

  async resendVerificationCode(userId: string, email: string) {
    const emailNorm = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        email: { equals: emailNorm, mode: 'insensitive' },
        status: { not: 'active' },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found or already verified');
    }

    // Tạo mã xác thực mới
    const newCodeId = uuidv4();
    const newCodeExpired = dayjs().add(10, 'minute').toDate();

    // Cập nhật mã xác thực mới
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        codeId: newCodeId,
        codeExpired: newCodeExpired,
      },
    });

    // Gửi email với mã mới
    await this.rabbitMQProducerService.publishMessage(
      RabbitMQTopics.RESEND_VERIFICATION_CODE,
      {
        id: user.id,
        email: user.email,
        password: user.password,
        name: user.name || '',
        roleId: user.roleId,
        codeId: newCodeId,
        codeExpired: newCodeExpired,
      },
    );

    return {
      message: 'Mã xác thực mới đã được gửi đến email của bạn',
      codeId: newCodeId,
      expiredAt: newCodeExpired,
    };
  }

  async validateOAuthUser(
    payload: {
      provider: string;
      providerId: string;
      email?: string;
      emailVerified?: boolean;
      name?: string;
    },
    meta: { ip?: string; userAgent?: string },
  ) {
    // try find by providerId
    let user = await this.prisma.user.findFirst({
      where: { provider: payload.provider, providerId: payload.providerId },
    });

    if (!user && payload.email) {
      user = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });
      if (user) {
        // link provider if email matches
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            provider: payload.provider,
            providerId: payload.providerId,
            emailVerified: payload.emailVerified ?? user.emailVerified,
          },
        });
        user = await this.prisma.user.findUnique({ where: { id: user.id } });
      }
    }

    if (!user) {
      // create new user
      const role =
        (await this.prisma.role.findUnique({ where: { name: 'USER' } })) ??
        (await this.prisma.role.create({ data: { name: 'USER' } }));

      const createData: any = {
        provider: payload.provider,
        providerId: payload.providerId,
        emailVerified: payload.emailVerified ?? false,
        roleId: role.id,
      };

      if (payload.email) {
        createData.email = payload.email;
      }

      if (payload.name) {
        createData.name = payload.name;
      }

      user = await this.prisma.user.create({
        data: createData,
      });
    }

    // return user (controller/strategy will call createSession)
    return user;
  }

  /** Role name for JWT — api-gateway RolesGuard checks e.g. @Roles('ADMIN') against this string, not roleId. */
  private async resolveRoleNameForJwt(user: {
    id: string;
    roleId?: string;
    role?: { name: string } | null;
  }): Promise<string> {
    if (user?.role && typeof user.role === 'object' && user.role.name) {
      return user.role.name;
    }
    if (user?.roleId) {
      const r = await this.prisma.role.findUnique({
        where: { id: user.roleId },
        select: { name: true },
      });
      if (r?.name) return r.name;
    }
    throw new UnauthorizedException('User role could not be resolved for token');
  }

  // create session => access + refresh tokens; store hashed refresh token
  async createSessionForUser(
    user: any,
    ip: string | null,
    userAgent: string | null,
  ) {
    const roleName = await this.resolveRoleNameForJwt(user);
    const payload = this.buildAccessTokenPayload(user, roleName);

    // access token (short lived)
    const accessToken = await this.jwtService.signAsync(payload, {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRE_IN || '15m',
    });

    // refresh token as random string
    const refreshRaw = randomBytes(64).toString('hex');
    const tokenHash = hashToken(refreshRaw);
    const expiresAt = new Date(
      Date.now() +
        Number(process.env.REFRESH_EXPIRE_DAYS || 7) * 24 * 3600 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshRaw, expiresAt };
  }

  // refresh rotation
  async refresh(refreshRaw: string, ip?: string, userAgent?: string) {
    const tokenHash = hashToken(refreshRaw);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (!token || token.revoked || token.expiresAt < new Date()) {
      if (token?.userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: token.userId },
          data: { revoked: true },
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    // revoke old
    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revoked: true },
    });

    // create new refresh token
    const newRaw = randomBytes(64).toString('hex');
    const newHash = hashToken(newRaw);
    const expiresAt = new Date(
      Date.now() +
        Number(process.env.REFRESH_EXPIRE_DAYS || 7) * 24 * 3600 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: token.userId,
        tokenHash: newHash,
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
        expiresAt,
      },
    });

    const roleName = await this.resolveRoleNameForJwt(token.user);
    const accessPayload = this.buildAccessTokenPayload(token.user, roleName);
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRE_IN || '15m',
    });

    return { accessToken, refreshToken: newRaw, expiresAt };
  }

  async revokeRefreshToken(refreshRaw: string) {
    const tokenHash = hashToken(refreshRaw);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  /**
   * Forgot password: không tiết lộ email có tồn tại hay không (generic message).
   * Token chỉ lưu hash; link một lần; gửi email qua notification-service (RabbitMQ).
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    const genericMessage =
      'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.';

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
      },
    });

    if (!user) {
      return { message: genericMessage };
    }

    const ttlHours = Number(
      this.config.get<string>('PASSWORD_RESET_EXPIRE_HOURS') ?? '1',
    );
    const expiresAt = dayjs().add(ttlHours, 'hour').toDate();

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const frontend =
      this.config.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000';
    const base = frontend.replace(/\/$/, '');
    const resetLink = `${base}/auth/reset-password?token=${encodeURIComponent(raw)}`;

    await this.rabbitMQProducerService.publishMessage(
      RabbitMQTopics.PASSWORD_RESET_REQUESTED,
      {
        id: user.id,
        email: user.email,
        name: user.name ?? '',
        resetLink,
        expiresAt: expiresAt.toISOString(),
      },
    );

    return { message: genericMessage };
  }

  async validatePasswordResetToken(token: string): Promise<{ valid: boolean }> {
    const tokenHash = hashToken(token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return { valid: false };
    }
    return { valid: true };
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException(
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
      );
    }

    const hash = await argon.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { password: hash },
      });
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revoked: false },
        data: { revoked: true },
      });
    });

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }
}
