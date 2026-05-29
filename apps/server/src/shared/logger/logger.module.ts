import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { buildPinoOptions } from './pino-config';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('nodeEnv') || 'development';
        return buildPinoOptions(env as 'development' | 'production' | 'test');
      },
    }),
  ],
})
export class LoggerModule {}
