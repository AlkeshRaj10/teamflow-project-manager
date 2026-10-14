import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService, SESSION_COOKIE, SESSION_DURATION_MS } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { LoginDto, RegisterDto } from "./auth.dto";
import type { AuthenticatedRequest } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.register(body.name, body.email, body.password);
    response.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { user, token } = await this.authService.login(body.email, body.password);
    response.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(request.cookies?.[SESSION_COOKIE]);
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    response.clearCookie(SESSION_COOKIE, clearOptions);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  currentUser(@Req() request: AuthenticatedRequest) {
    return { user: request.currentUser };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_DURATION_MS,
    };
  }
}
