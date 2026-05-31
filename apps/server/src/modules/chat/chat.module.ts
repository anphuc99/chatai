import { Module } from '@nestjs/common';
import { HistoryStoreService } from './services/history-store.service';
import { OocService } from './services/ooc.service';

@Module({
  providers: [HistoryStoreService, OocService],
  exports: [HistoryStoreService, OocService],
})
export class ChatModule {}
