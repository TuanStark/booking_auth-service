import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthDTO } from './dto';
import * as argon from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/user/user.service';
import { CurrentUser } from './types/current-user';
import { MailerService } from '@nestjs-modules/mailer';
// import * as dayjs from 'dayjs';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';

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

    const hash = await argon.hash(password);
    const codeId = uuidv4();
;    // Tạo user
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hash,
          fullName: fullName || '',
          roleId: 4,
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
          name: user.fullName,
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

  async login(user : any) {    
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

    // Generate access token (short-lived)
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1d', // 15 minutes
      secret: this.config.get('JWT_SECRET'),
    });

    // Generate refresh token (long-lived)
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '7d', // 7 days
      secret: this.config.get('JWT_SECRET'),
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

  async validateJwtUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedException('User not found!');
    const currentUser: CurrentUser = { id: user.id, role: user.role.roleName };
    return currentUser;
  }

  async handleActive(codeId: string, id: number) {
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

  async resendVerificationCode(userId: number, email: string) {
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
        name: user.fullName,
        activationCode: newCodeId,
      },
    });

    return {
      message: 'Mã xác thực mới đã được gửi đến email của bạn',
      codeId: newCodeId,
      expiredAt: newCodeExpired,
    };
  }
}
