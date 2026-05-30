import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TtsService } from './tts.service';
import { SynthesizeDto } from './dto/synthesize.dto';
import { TestVoiceDto } from './dto/test-voice.dto';
import { RedisThrottlerGuard } from '../../shared/throttler/redis-throttler.guard';
import { Throttle } from '../../shared/throttler/throttle.decorator';

@Controller('tts')
@UseGuards(RedisThrottlerGuard)
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('synthesize')
  @Throttle(30, 60)
  async synthesize(@Body() dto: SynthesizeDto) {
    const r = await this.ttsService.synthesize(dto);
    return { audioUrl: r.url, cached: r.fromCache };
  }

  @Post('test-voice')
  @Throttle(30, 60)
  async testVoice(@Body() dto: TestVoiceDto) {
    const r = await this.ttsService.testVoice(dto.voiceName, dto.pitch, dto.sampleText);
    return { audioUrl: r.url };
  }
}
