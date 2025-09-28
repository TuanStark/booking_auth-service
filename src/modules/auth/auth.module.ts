import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy, LocalStrategy } from './strategy';
import { UserModule } from 'src/modules/user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from 'src/prisma/prisma.module';
import jwtConfig from './config/jwt.config';
import { JwtConfig } from './config/jwt.config';

@Module({
  imports: [
    UserModule,
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.get<JwtConfig>('jwt');
        if (!config) {
          throw new Error('JWT configuration not found');
        }
        return {
          privateKey: config.privateKey,
          publicKey: config.publicKey,
          signOptions: {
            algorithm: 'RS256',
            expiresIn: config.signOptions.expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
  ],
  exports: [AuthService, JwtStrategy, LocalStrategy, PassportModule],
})
export class AuthModule {}
