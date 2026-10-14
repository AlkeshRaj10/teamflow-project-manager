import { Module } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthGuard, AuthService, PrismaService],
})
export class AuthModule {}
