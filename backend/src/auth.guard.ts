import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService, SESSION_COOKIE } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.authService.currentUser(request.cookies?.[SESSION_COOKIE]);
    request.currentUser = user;
    return true;
  }
}
