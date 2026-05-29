import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

type TraceStore = Map<string, unknown>;

@Injectable()
export class TraceContextService {
  private readonly als = new AsyncLocalStorage<TraceStore>();

  run<T>(traceId: string, fn: () => T): T {
    const store = new Map<string, unknown>([['traceId', traceId]]);
    return this.als.run(store, fn);
  }

  getTraceId(): string | null {
    const store = this.als.getStore();
    return (store?.get('traceId') as string) ?? null;
  }

  set(key: string, value: unknown): void {
    const store = this.als.getStore();
    store?.set(key, value);
  }

  get(key: string): unknown {
    const store = this.als.getStore();
    return store?.get(key) ?? null;
  }
}
