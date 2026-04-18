import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    
    // التأكد من أن دور المستخدم موجود ضمن الأدوار المسموحة
    const hasRole = requiredRoles.some((role) => user.role?.includes(role));
    
    if (!hasRole) {
      throw new ForbiddenException('ليس لديك صلاحية الوصول لهذا القسم');
    }

    return true;
  }
}