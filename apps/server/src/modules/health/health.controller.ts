import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    const { status, checks } = await this.healthService.getStatus();
    const uptime = this.healthService.getUptime();
    const version = this.healthService.getVersion();

    return {
      status,
      uptime,
      version,
      checks,
      timestamp: Date.now(),
    };
  }
}
