export type EndChatResult = {
  journalSessionId: string;
  summary: string; // sessionSummary
  messageCount: number;
  alreadyEnded: boolean; // true nếu hit idempotency
};
