import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
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
import { RabbitMQTopics } from '@/messaging/rabbitmq/rabbitmq.topic';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private userService: UserService,
    private rabbitMQProducerService: RabbitMQProducerService,
    private redisService: RedisService,
  ) { }

  async register(dto: AuthDTO) {
    const { email, password, name } = dto;
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email already in use');
    }

    const hash = await argon.hash(password);
    const codeId = uuidv4();
    // Create user
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hash,
          name: name || '',
          roleId: 'cb8d828d-c0b9-460f-8b30-f7de4152e84f',
          status: "unactive",
          codeId: codeId,
          codeExpired: dayjs().add(1, 'minute').toDate(),
        },
      });
      await this.rabbitMQProducerService.emitCreateUserEvent(RabbitMQTopics.CREATE_USER, {
        id: user.id,
        email: user.email,
        password: user.password,
        name: name || '',
        roleId: user.roleId || 'cb8d828d-c0b9-460f-8b30-f7de4152e84f',
        codeId: user.codeId || '',
        codeExpired: user.codeExpired || dayjs().add(1, 'minute').toDate(),
      });
      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ForbiddenException('User with email already exists');
      }
    }
  }

  async login(loginDto: { email: string; password: string }) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new ForbiddenException('Invalid credentials');
    }

    // Generate tokens
    const token = await this.signJwtToken(user);
    return token;
  }

  //now convert to an object, not string
  async signJwtToken(
    user
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

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
        console.log('User not found:', email);
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
    const user = await this.prisma.user.findUnique({
      where: {
        id: id,
        codeId: codeId,
      },
    });
    if (!user) {
      throw new BadRequestException('Khong tìm thấy người dùng');
    }
    if (user.codeId !== codeId) {
      throw new BadRequestException('Mã xác thực không chính xác');
    }
    const isBeforeCheck = dayjs().isBefore(user.codeExpired);
    if (!isBeforeCheck) {
      throw new BadRequestException('Mã xác thực đã hết hạn');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'active'
      },
    });
    return user;
  }

  async resendVerificationCode(userId: string, email: string) {
    // Tìm user theo ID và email để đảm bảo an toàn
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        email: email,
        status: 'unactive' // Chỉ cho phép gửi lại mã nếu chưa active
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
    await this.rabbitMQProducerService.emitResendVerificationCodeEvent(RabbitMQTopics.RESEND_VERIFICATION_CODE, {
      id: user.id,
      email: user.email,
      password: user.password,
      name: user.name || '',
      roleId: user.roleId,
      codeId: newCodeId,
      codeExpired: newCodeExpired,
    });

    return {
      message: 'Mã xác thực mới đã được gửi đến email của bạn',
      codeId: newCodeId,
      expiredAt: newCodeExpired,
    };
  }

  async validateOAuthUser(payload: { provider: string; providerId: string; email?: string; emailVerified?: boolean; name?: string }, meta: { ip?: string; userAgent?: string }) {
    // try find by providerId
    let user = await this.prisma.user.findFirst({
      where: { provider: payload.provider, providerId: payload.providerId },
    });

    if (!user && payload.email) {
      user = await this.prisma.user.findUnique({ where: { email: payload.email } });
      if (user) {
        // link provider if email matches
        await this.prisma.user.update({
          where: { id: user.id },
          data: { provider: payload.provider, providerId: payload.providerId, emailVerified: payload.emailVerified ?? user.emailVerified },
        });
        user = await this.prisma.user.findUnique({ where: { id: user.id } });
      }
    }

    if (!user) {
      // create new user
      const role = await this.prisma.role.findUnique({ where: { name: 'USER' } }) ??
        await this.prisma.role.create({ data: { name: 'USER' } });

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

  // create session => access + refresh tokens; store hashed refresh token
  async createSessionForUser(user: any, ip: string | null, userAgent: string | null) {
    const payload = { sub: user.id, email: user.email, role: user.roleId };

    // access token (short lived)
    const accessToken = await this.jwtService.signAsync(payload, {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRE_IN || '15m',
    });

    // refresh token as random string
    const refreshRaw = randomBytes(64).toString('hex');
    const tokenHash = hashToken(refreshRaw);
    const expiresAt = new Date(Date.now() + (Number(process.env.REFRESH_EXPIRE_DAYS || 7) * 24 * 3600 * 1000));

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
      include: { user: true },
    });

    if (!token || token.revoked || token.expiresAt < new Date()) {
      if (token?.userId) {
        await this.prisma.refreshToken.updateMany({ where: { userId: token.userId }, data: { revoked: true } });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    // revoke old
    await this.prisma.refreshToken.update({ where: { id: token.id }, data: { revoked: true } });

    // create new refresh token
    const newRaw = randomBytes(64).toString('hex');
    const newHash = hashToken(newRaw);
    const expiresAt = new Date(Date.now() + (Number(process.env.REFRESH_EXPIRE_DAYS || 7) * 24 * 3600 * 1000));
    await this.prisma.refreshToken.create({
      data: { userId: token.userId, tokenHash: newHash, ip: ip ?? undefined, userAgent: userAgent ?? undefined, expiresAt },
    });

    const accessToken = await this.jwtService.signAsync({ sub: token.user.id, email: token.user.email, role: token.user.roleId }, { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRE_IN || '15m' });

    return { accessToken, refreshToken: newRaw, expiresAt };
  }

  async revokeRefreshToken(refreshRaw: string) {
    const tokenHash = hashToken(refreshRaw);
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
  }
}
