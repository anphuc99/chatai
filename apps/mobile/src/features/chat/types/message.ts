export interface Word {
  hz: string;
  py: string;
  vn: string;
}

export interface ShopEvent {
  itemName: string;
  price: number;
}

export type ChatMessage =
  | {
      kind: 'user';
      id: string;
      text: string;
      timestamp: number;
    }
  | {
      kind: 'assistant';
      id: string;
      characterId: string | null;
      characterName: string;
      text: string;
      translation?: string | null;
      emotion?: string | null;
      intensity?: string | null;
      words?: Word[] | null;
      shopEvent?: ShopEvent | null;
      timestamp: number;
    }
  | {
      kind: 'persistent_ooc' | 'ephemeral_ooc';
      id: string;
      text: string;
      timestamp: number;
    }
  | {
      kind: 'system';
      id: string;
      text: string;
      timestamp: number;
    };
