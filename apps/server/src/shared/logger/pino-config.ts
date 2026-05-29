import { Params } from 'nestjs-pino';

export function buildPinoOptions(env: 'development' | 'production' | 'test'): Params {
  const isDev = env === 'development';

  return {
    pinoHttp: {
      level: isDev ? 'debug' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
      ...(isDev && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
          },
        },
      }),
      customProps: (req: any) => ({
        traceId: req.headers?.['x-request-id'] || undefined,
      }),
      serializers: {
        req: (req: any) => ({
          method: req.method,
          url: req.url,
          query: req.query,
          params: req.params,
        }),
      },
    },
  };
}
