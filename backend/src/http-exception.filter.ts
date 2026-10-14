import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      const message = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
      this.logger.error("Unhandled request error", message);
    }
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const responseMessage = typeof exceptionResponse === "object" && exceptionResponse !== null
      ? (exceptionResponse as { message?: string | string[] }).message
      : undefined;

    response.status(status).json({
      statusCode: status,
      error: this.errorName(status),
      message: status >= 500
        ? "An unexpected error occurred."
        : responseMessage ?? "Request failed.",
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private errorName(status: number): string {
    const names: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      429: "Too Many Requests",
    };
    return names[status] ?? (status >= 500 ? "Internal Server Error" : "Request Failed");
  }
}
