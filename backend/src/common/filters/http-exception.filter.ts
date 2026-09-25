import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(
    AllExceptionsFilter.name,
  );

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response =
      ctx.getResponse<Response>();
    const request =
      ctx.getRequest<Request>();

    let status =
      HttpStatus.INTERNAL_SERVER_ERROR;

    let message:
      | string
      | string[] =
      'Error interno del servidor';

    let error =
      'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const exceptionResponse =
        exception.getResponse();

      if (
        typeof exceptionResponse ===
          'object' &&
        exceptionResponse !== null
      ) {
        const responseObject =
          exceptionResponse as {
            message?:
              | string
              | string[];
            error?: string;
          };

        if (responseObject.message) {
          message =
            responseObject.message;
        }

        if (responseObject.error) {
          error =
            responseObject.error;
        } else {
          error =
            exception.name;
        }
      } else if (
        typeof exceptionResponse ===
        'string'
      ) {
        message =
          exceptionResponse;
        error =
          exception.name;
      } else {
        message =
          'Error de solicitud.';
        error =
          exception.name;
      }
    } else {
      this.logUnexpectedException(
        exception,
        request,
      );
    }

    const responseBody = {
      statusCode: status,
      timestamp:
        new Date().toISOString(),
      path: request.url,
      method: request.method,
      tenant:
        request.tenantCode ||
        request.tenantId ||
        null,
      error,
      message: Array.isArray(message)
        ? message
        : [message],
    };

    response
      .status(status)
      .json(responseBody);
  }

  private logUnexpectedException(
    exception: unknown,
    request: Request,
  ) {
    if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Unhandled non-Error exception on ${request.method} ${request.url}`,
      );
    }
  }
}