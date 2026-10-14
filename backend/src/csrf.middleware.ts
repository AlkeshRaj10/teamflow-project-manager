import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(request.method)) {
      next();
      return;
    }

    const configuredOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
    if (request.get("origin") !== configuredOrigin) {
      next(new ForbiddenException("Invalid request origin."));
      return;
    }
    next();
  }
}
