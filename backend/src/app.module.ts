import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuthModule } from "./auth.module";
import { CsrfMiddleware } from "./csrf.middleware";

@Module({
  imports: [AuthModule],
  providers: [CsrfMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
