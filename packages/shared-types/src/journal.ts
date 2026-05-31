import { MessageDto } from './chat';

export interface SessionSummaryDto {
  id: string;
  storyId: string;
  storyTitle: string;
  summary: string;
  startedAt: number;
  endedAt: number;
  messageCount: number;
  wordCount: number;
}

export interface SessionDetailDto extends SessionSummaryDto {
  messages: MessageDto[];
}

export interface ListSessionsResponseDto {
  items: SessionSummaryDto[];
  nextCursor: string | null;
}
