import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class HealthService implements OnModuleInit {
  private startedAt: number = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.startedAt = Date.now();
  }

  async getStatus(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, string> }> {
    const [pgHealthy, redisHealthy] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    const checks: Record<string, string> = {
      postgres: pgHealthy ? 'ok' : 'fail',
      redis: redisHealthy ? 'ok' : 'fail',
    };
    const status = Object.values(checks).every((v) => v === 'ok') ? 'ok' : 'degraded';
    return { status, checks };
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getVersion(): string {
    return process.env.npm_package_version || '0.1.0';
  }

  async checkPostgres(): Promise<boolean> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    return this.redis.ping();
  }
}
