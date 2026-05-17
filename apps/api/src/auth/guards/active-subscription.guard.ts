import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../types/auth-user";

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const authUser = request.user;

    if (!authUser) {
      throw new UnauthorizedException("Login is required.");
    }

    if (authUser.role === UserRole.ADMIN) {
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Session user no longer exists.");
    }

    const subscriptionEndsAt = user.subscriptionEndsAt;
    const hasActiveSubscription =
      user.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      subscriptionEndsAt !== null &&
      subscriptionEndsAt > new Date();

    if (!hasActiveSubscription) {
      throw new ForbiddenException("Active crushclub membership required.");
    }

    return true;
  }
}
