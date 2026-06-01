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
  isAuto?: boolean;
}

export interface StartSessionDto {
  storyId: string;
}

export interface SendMessageDto {
  userMessage: string;
  ephemeralOOC?: string;
}

export interface OocDto {
  type: 'persistent' | 'ephemeral';
  text: string;
}

export interface ToggleCharacterDto {
  characterId: string;
  on: boolean;
}

export interface TempCharacterDto {
  name: string;
  description: string;
}

export interface MessageDto {
  role: string;
  text: string;
  timestamp: number;
  characterName?: string | null;
  translation?: string | null;
  emotion?: string | null;
  intensity?: string | null;
  words?: Array<{ hz: string; py: string; vn: string }> | null;
  shopEvent?: { itemName: string; price: number } | null;
}

export interface HydratedHistoryDto {
  messages: MessageDto[];
  persistentOOC: string | null;
  activeCharacters: string[];
}

export interface SessionResultDto {
  sessionId: string;
  isResumed: boolean;
  initialActiveCharacters: string[];
}

export interface EndChatResultDto {
  journalSessionId: string;
  summary: string;
  messageCount: number;
  alreadyEnded: boolean;
}

