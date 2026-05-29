import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AppException } from '../errors/app-exception';
import { TraceContextService } from '../tracing/trace-context.service';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly traceContext: TraceContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const traceId = this.traceContext.getTraceId();

    const normalized = this.normalize(exception);

    if (normalized.status >= 500) {
      this.logger.error(
        { err: exception, traceId, code: normalized.code },
        `Unhandled error: ${normalized.message}`,
      );
    } else {
      this.logger.warn(
        { code: normalized.code, status: normalized.status, traceId },
        normalized.message,
      );
    }

    const errorBody: Record<string, unknown> = {
      code: normalized.code,
      message: normalized.message,
    };
    if (normalized.details) {
      errorBody.details = normalized.details;
    }

    res.status(normalized.status).send({ error: errorBody });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, any>;
        return {
          status: exception.getStatus(),
          code: resp.code || `HTTP_${exception.getStatus()}`,
          message: resp.message || exception.message,
          details: resp.details,
        };
      }
      return {
        status: exception.getStatus(),
        code: `HTTP_${exception.getStatus()}`,
        message: exception.message,
      };
    }

    if (exception instanceof Error) {
      return {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Lỗi máy chủ',
      };
    }

    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Lỗi máy chủ',
    };
  }
}
