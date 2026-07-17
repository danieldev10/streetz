import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../roles.decorator";
import { AuthUser } from "../types/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
import { getAccountAccessBlock } from "../../users/account-status";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    if (!request.user) {
      throw new UnauthorizedException("Login is required.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        role: true,
        accountStatus: true,
        suspendedUntil: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Session user no longer exists.");
    }

    const accountBlock = getAccountAccessBlock(user);

    if (accountBlock) {
      throw new ForbiddenException(accountBlock);
    }

    return requiredRoles.includes(user.role);
  }
}
