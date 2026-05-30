import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
        {
          provide: RedisService,
          useValue: {
            ping: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('check returns ok status', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
  });

  it('check includes uptime number', async () => {
    const result = await controller.check();
    expect(typeof result.uptime).toBe('number');
  });

  it('check includes version string', async () => {
    const result = await controller.check();
    expect(typeof result.version).toBe('string');
  });

  it('check includes timestamp', async () => {
    const result = await controller.check();
    expect(typeof result.timestamp).toBe('number');
  });
});
