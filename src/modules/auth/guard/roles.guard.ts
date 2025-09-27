import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorator/role.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lấy danh sách roles yêu cầu từ decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu không yêu cầu role, cho phép truy cập
    if (!requiredRoles) {
      return true;
    }

    // Lấy thông tin user từ request (được gán bởi JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Kiểm tra xem user có role trong payload không
    if (!user || !user.role) {
      throw new ForbiddenException('User role not found in JWT');
    }

    // Kiểm tra xem role của user có khớp với role yêu cầu không
    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException('User does not have the required role');
    }

    return true;
  }
}