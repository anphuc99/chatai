export interface AssistantMessageDto {
  id: string;
  characterId: string | null;
  characterName: string | null;
  text: string;
  translation: string | null;
  emotion: string | null;
  intensity: string | null;
  words: Array<{ hz: string; py: string; vn: string }> | null;
  shopEvent: { itemName: string; price: number } | null;
  timestamp: number;
}

export interface AssistantBatchDto {
  messages: AssistantMessageDto[];
  triggerMemory: boolean;
}
