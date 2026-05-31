export class SessionSummaryDto {
  id!: string;
  storyId!: string;
  storyTitle!: string;
  summary!: string;
  startedAt!: number;
  endedAt!: number;
  messageCount!: number;
  wordCount!: number;
}
