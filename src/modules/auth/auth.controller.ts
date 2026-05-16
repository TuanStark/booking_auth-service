import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus as NestHttpStatus,
  ForbiddenException,
  Get,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthDTO,
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetTokenDto,
} from './dto';
import { ResponseData } from '../../common/global/globalClass';
import { HttpStatus, HttpMessage } from '../../common/global/globalEnum';
import { LocalAuthGuard } from './guard';
import { AuthGuard } from '@nestjs/passport';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  path: '/',
  maxAge: Number(process.env.REFRESH_EXPIRE_DAYS || 7) * 24 * 3600 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  async register(@Req() request: Request, @Body() createAuthDto: AuthDTO) {
    try {
      const user = await this.authService.register(createAuthDto);
      return new ResponseData(user, HttpStatus.CREATED, HttpMessage.CREATED);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        if (
          error.message.includes('already in use') ||
          error.message.includes('already exists')
        ) {
          return new ResponseData(
            null,
            HttpStatus.CONFLICT,
            HttpMessage.ALREADY_EXISTS,
          );
        }
        return new ResponseData(
          null,
          HttpStatus.FORBIDDEN,
          HttpMessage.ACCESS_DENIED,
        );
      }

      if (error.code === 'P2002') {
        // Prisma unique constraint error
        return new ResponseData(
          null,
          HttpStatus.CONFLICT,
          HttpMessage.ALREADY_EXISTS,
        );
      }

      // Handle validation errors
      if (error.status === 400) {
        return new ResponseData(
          error.response,
          HttpStatus.VALIDATION_ERROR,
          HttpMessage.VALIDATION_ERROR,
        );
      }

      return new ResponseData(
        error,
        HttpStatus.SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  @Post('check-code')
  async checkCode(@Body() body: { codeId: string; id: string }) {
    try {
      const user = await this.authService.handleActive(body.codeId, body.id);
      return new ResponseData(user, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      return new ResponseData(
        null,
        HttpStatus.NOT_FOUND,
        HttpMessage.NOT_FOUND,
      );
    }
  }

  @Post('resend-code')
  async resendCode(@Body() body: { id: string; email: string }) {
    try {
      const result = await this.authService.resendVerificationCode(
        body.id,
        body.email,
      );
      return new ResponseData(result, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      if (error.message.includes('User not found')) {
        return new ResponseData(
          null,
          HttpStatus.NOT_FOUND,
          'Người dùng không tồn tại',
        );
      }
      if (error.message.includes('already verified')) {
        return new ResponseData(
          null,
          HttpStatus.CONFLICT,
          'Tài khoản đã được xác thực',
        );
      }
      return new ResponseData(
        null,
        HttpStatus.SERVER_ERROR,
        'Có lỗi xảy ra khi gửi lại mã xác thực',
      );
    }
  }

  @Post('forgot-password')
  @HttpCode(NestHttpStatus.OK)
  async forgotPassword(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ForgotPasswordDto,
  ) {
    try {
      const result = await this.authService.requestPasswordReset(dto.email);
      return new ResponseData(result, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      console.error('forgot-password:', error);
      return new ResponseData(
        null,
        HttpStatus.SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  @Post('reset-password/validate')
  @HttpCode(NestHttpStatus.OK)
  async validateResetPasswordToken(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ValidateResetTokenDto,
  ) {
    try {
      const result = await this.authService.validatePasswordResetToken(
        dto.token,
      );
      return new ResponseData(result, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      console.error('reset-password/validate:', error);
      return new ResponseData(
        null,
        HttpStatus.SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  @Post('reset-password')
  @HttpCode(NestHttpStatus.OK)
  async resetPassword(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ResetPasswordDto,
  ) {
    try {
      const result = await this.authService.resetPasswordWithToken(
        dto.token,
        dto.password,
      );
      return new ResponseData(result, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      if (error instanceof BadRequestException) {
        const msg =
          typeof error.getResponse() === 'string'
            ? error.getResponse()
            : (error.getResponse() as { message?: string })?.message ??
              error.message;
        return new ResponseData(
          null,
          HttpStatus.VALIDATION_ERROR,
          Array.isArray(msg) ? msg.join(', ') : String(msg),
        );
      }
      console.error('reset-password:', error);
      return new ResponseData(
        null,
        HttpStatus.SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  @Post('login')
  async login(@Req() req, @Body() loginDto: { email: string; password: string }) {
    try {
      const response = await this.authService.login(loginDto, req.ip, req.headers['user-agent']);
      return new ResponseData(
        response,
        HttpStatus.SUCCESS,
        HttpMessage.SUCCESS,
      );
    } catch (error) {
      console.log(error.code);
      const payload = typeof error?.getResponse === 'function'
        ? error.getResponse()
        : error?.response?.message ?? error?.message ?? {};
      const data = typeof payload === 'object' ? payload : {};
      if (
        data?.code === 'EMAIL_NOT_VERIFIED' &&
        data?.userId &&
        data?.email
      ) {
        // Automatically resend code when the user tries to login but is unverified
        try {
          await this.authService.resendVerificationCode(data.userId, data.email);
        } catch (resendError) {
          console.error('Auto resend code failed during login:', resendError);
        }

        throw new ForbiddenException({
          code: 'EMAIL_NOT_VERIFIED',
          userId: data.userId,
          email: data.email,
          message: 'Vui lòng xác thực email trước khi đăng nhập. Một mã xác thực mới đã được gửi.',
        });
      }
      throw new UnauthorizedException(HttpMessage.INVALID_CREDENTIALS);
    }
  }

  @Post('refresh')
  async refresh(
    @Req() req,
    @Body() body: { refreshToken?: string },
    @Res() res,
  ) {
    const refreshToken =
      req.cookies?.refresh_token || body?.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: 'No refresh token' });

    const { accessToken, refreshToken: newRefresh } =
      await this.authService.refresh(
        refreshToken,
        req.ip,
        req.headers['user-agent'],
      );
    res.cookie('refresh_token', newRefresh, cookieOptions);
    return res.json({ accessToken, refreshToken: newRefresh });
  }

  @Post('logout')
  async logout(@Req() req, @Res() res) {
    const refresh = req.cookies?.refresh_token;
    if (refresh) await this.authService.revokeRefreshToken(refresh);
    res.clearCookie('refresh_token', cookieOptions);
    return res.json({ ok: true });
  }

  // Google OAuth routes
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {
    // redirect handled by passport
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    // validateOAuthUser returns a User object, now create session
    const user = req.user;
    const { accessToken, refreshToken } =
      await this.authService.createSessionForUser(
        user,
        req.ip,
        req.headers['user-agent'],
      );
    res.cookie('refresh_token', refreshToken, cookieOptions);
    // redirect to frontend with access token (or set cookie and redirect)
    const redirect = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${redirect}/auth/success?accessToken=${accessToken}`);
  }
}
