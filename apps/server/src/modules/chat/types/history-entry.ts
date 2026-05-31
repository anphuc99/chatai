export type EntryType =
  | 'user'
  | 'assistant_batch'
  | 'persistent_ooc'
  | 'ephemeral_ooc'
  | 'checkpoint'
  | 'system'
  | 'character_toggle';

export interface AssistantMessage {
  characterName: string;
  text: string;
  emotion?: string;
  intensity?: string;
  translation?: string | null;
  words?: Array<{ hz: string; py: string; vn: string }> | null;
  shopEvent?: { itemName: string; price: number } | null;
}

export type HistoryEntry =
  | { type: 'user'; timestamp: number; data: { text: string; ephemeralOOC?: string } }
  | {
      type: 'assistant_batch';
      timestamp: number;
      data: { messages: AssistantMessage[]; triggerMemory?: boolean };
    }
  | { type: 'persistent_ooc'; timestamp: number; data: { text: string } }
  | { type: 'ephemeral_ooc'; timestamp: number; data: { text: string } }
  | {
      type: 'checkpoint';
      timestamp: number;
      data: { summary: string; tokensBefore: number; entriesCovered: number };
    }
  | { type: 'system'; timestamp: number; data: { storyId: string; activeCharacters: string[]; note?: string } }
  | { type: 'character_toggle'; timestamp: number; data: { characterId: string; name: string; on: boolean } };
