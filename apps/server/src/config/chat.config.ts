import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatConfig {
  public readonly MAX_HISTORY_TOKENS: number;
  public readonly CHECKPOINT_TRIGGER_RATIO: number;

  constructor(private readonly cfg: ConfigService) {
    this.MAX_HISTORY_TOKENS = Number(this.cfg.get<number>('maxHistoryTokens', 6000));
    this.CHECKPOINT_TRIGGER_RATIO = Number(this.cfg.get<number>('checkpointTriggerRatio', 0.8));
  }

  triggerThreshold(): number {
    return Math.floor(this.MAX_HISTORY_TOKENS * this.CHECKPOINT_TRIGGER_RATIO);
  }
}
