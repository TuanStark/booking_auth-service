import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthDTO } from './dto';
import { hashPassword, comparePassword } from '../../shared/utils/argon2.util';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/user/user.service';
import { CurrentUser } from './types/current-user';
import { MailerService } from '@nestjs-modules/mailer';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { hashToken } from '../../shared/utils/token.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private userService: UserService,
    private mailerService: MailerService,
  ) {}

  async register(dto: AuthDTO) {
    const { email, password, fullName } = dto;
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email already in use');
    }

    const hash = await hashPassword(password);
    const codeId = uuidv4();
;    // Tạo user
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hash,
          name: fullName || '',
          roleId: 'cb8d828d-c0b9-460f-8b30-f7de4152e84f',
          status: "unactive",
          codeId: codeId,
          codeExpired: dayjs().add(1, 'minute').toDate(),
        },
      });
      this.mailerService.sendMail({
        to: user.email,
        subject: 'Activate your account at @EnglishMaster',
        template: 'register',
        context: {
          name: user.name,
          activationCode: codeId,
        },
      });
      return user;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ForbiddenException('User with email already exists');
      }
    }
  }

  // Local login
  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ 
      where: { email: dto.email },
      include: { role: true } // Thêm include role để lấy thông tin role
    });
    
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    
    if (user.status !== 'active') {
      throw new ForbiddenException('Account not active');
    }

    const ok = await comparePassword(dto.password, user.password);
    
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSessionForUser(user, null, null);
    return { 
      user: {
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role?.name || 'user' // Sử dụng optional chaining và có giá trị mặc định
      }, 
      ...session 
    };
  }

  async validateUser(email: string, password: string) {
    try {
      console.log('Validating user:', email);
      const user = await this.userService.findByEmail(email);
      
      if (!user) {
        console.log('User not found in database');
        return null;
      }

      console.log('User found, comparing password...');
      const isPasswordValid = await comparePassword(password, user.password);
      console.log('Password validation result:', isPasswordValid);
      
      if (!isPasswordValid) {
        console.log('Password validation failed');
        return null;
      }
      
      console.log('User validated successfully');
      // Return user without password
      const { password: _, ...result } = user;
      return result;
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
    const newCodeExpired = dayjs().add(1, 'minute').toDate();

    // Cập nhật mã xác thực mới
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        codeId: newCodeId,
        codeExpired: newCodeExpired,
      },
    });

    // Gửi email với mã mới
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Activate your account at @EnglishMaster - New Code',
      template: 'register',
      context: {
        name: user.name,
        activationCode: newCodeId,
      },
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
    const role = await this.prisma.role.findUnique({ where: { id: user.roleId } });
    const payload = { sub: user.id, email: user.email, role: role?.name };

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

    return { 
      accessToken, 
      refreshToken: refreshRaw, 
      expiresAt 
    };
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
        await this.prisma.refreshToken.updateMany({ where: { userId: token.userId }, data: { revoked: true }});
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
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true }});
  }
}
