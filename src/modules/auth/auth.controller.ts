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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDTO, LoginDTO } from './dto';
import { ResponseData } from '../../common/global/globalClass';
import { HttpStatus, HttpMessage } from '../../common/global/globalEnum';
import { LocalAuthGuard } from './guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  async register(@Req() request: Request,@Body() createAuthDto: AuthDTO) {
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
  async checkCode(@Body() body: { codeId: string, id: string } ) {
    try {
      const user = await this.authService.handleActive(body.codeId, +body.id);
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
  async resendCode(@Body() body: { id: string, email: string }) {
    try {
      const result = await this.authService.resendVerificationCode(+body.id, body.email);
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

    @UseGuards(LocalAuthGuard)
    @Post('login')
    async login(@Req() req: any) {
      try {
        // LocalAuthGuard đã validate user, user info có trong req.user
        const user = req.user;
        const response = await this.authService.login(user);
        
        return new ResponseData(response, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
      } catch (error) {
        return new ResponseData(
          null,
          HttpStatus.UNAUTHORIZED,
          HttpMessage.INVALID_CREDENTIALS
        );
      }
    }

  @Post('refresh')
  @HttpCode(NestHttpStatus.OK)
  async refreshTokens(@Body() body: { refreshToken: string }) {
    try {
      const tokens = await this.authService.refreshTokens(body.refreshToken);
      return new ResponseData(tokens, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        if (error.message.includes('Invalid refresh token')) {
          return new ResponseData(
            null,
            HttpStatus.UNAUTHORIZED,
            HttpMessage.REFRESH_TOKEN_INVALID,
          );
        }
        if (error.message.includes('Access denied')) {
          return new ResponseData(
            null,
            HttpStatus.FORBIDDEN,
            HttpMessage.ACCESS_DENIED,
          );
        }
        return new ResponseData(
          null,
          HttpStatus.FORBIDDEN,
          HttpMessage.ACCESS_DENIED,
        );
      }

      return new ResponseData(
        error,
        HttpStatus.SERVER_ERROR,
        HttpMessage.SERVER_ERROR,
      );
    }
  }

  // @Post('google')
  // async loginGoogle(@Body() dto: { email: string; name: string; googleId: string }) {
  //   try {
  //     return new ResponseData(
  //       await this.authService.loginGoogle(dto),
  //       HttpStatus.SUCCESS,
  //       HttpMessage.SUCCESS,
  //     );
  //   } catch (error) {
  //     return new ResponseData(
  //       error,
  //       HttpStatus.SERVER_ERROR,
  //       HttpMessage.SERVER_ERROR,
  //     );
  //   }
  // }
}
