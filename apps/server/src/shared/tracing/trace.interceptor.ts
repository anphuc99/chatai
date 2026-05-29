import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { TraceContextService } from './trace-context.service';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly traceContext: TraceContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const traceId = req.headers['x-request-id'] || uuidv4();
    res.header('X-Request-Id', traceId);

    const startTime = Date.now();
    const method = req.method;
    const url = req.url;

    this.logger.log(`→ ${method} ${url} [${traceId}]`);

    return new Observable((subscriber) => {
      this.traceContext.run(traceId, () => {
        next.handle().pipe(
          tap({
            next: (val) => {
              const duration = Date.now() - startTime;
              this.logger.log(`← ${method} ${url} ${res.statusCode} ${duration}ms [${traceId}]`);
              subscriber.next(val);
              subscriber.complete();
            },
            error: (err) => {
              const duration = Date.now() - startTime;
              this.logger.warn(`← ${method} ${url} ERR ${duration}ms [${traceId}]`);
              subscriber.error(err);
            },
          }),
        ).subscribe();
      });
    });
  }
}
