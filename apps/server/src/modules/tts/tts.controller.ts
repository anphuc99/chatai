import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TtsService } from './tts.service';
import { SynthesizeDto } from './dto/synthesize.dto';
import { TestVoiceDto } from './dto/test-voice.dto';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { Throttle } from '../../shared/throttler/throttle.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';

@Controller('tts')
@UseGuards(RedisThrottlerGuard)
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('synthesize')
  @Throttle(30, 60)
  async synthesize(@CurrentUser() _user: AuthUser, @Body() dto: SynthesizeDto) {
    const r = await this.ttsService.synthesize(dto);
    return { audioUrl: r.url, cached: r.fromCache };
  }

  @Post('test-voice')
  @Throttle(30, 60)
  async testVoice(@CurrentUser() _user: AuthUser, @Body() dto: TestVoiceDto) {
    const r = await this.ttsService.testVoice(dto.voiceName, dto.pitch, dto.sampleText);
    return { audioUrl: r.url };
  }
}
