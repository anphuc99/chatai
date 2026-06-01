import { create } from 'zustand';
import { Alert } from 'react-native';
import { MessageDto, JournalMessageDto, CharacterDto } from '@chatai/shared-types';
import { ChatMessage } from '../types/message';
import { chatService } from '../services/chat.service';
import { characterApi } from '../../character/services/character.api';
import { getPlaybackManagerSingleton } from '../services/playback-queue.manager';

export interface ChatState {
  sessionId: string | null;
  storyId: string | null;
  messages: ChatMessage[];
  activeCharacters: string[];
  persistentOOC: string;
  temporaryCharacters: Array<{ tempId: string; name: string; description: string }>;
  charactersFull: CharacterDto[];
  inputLocked: boolean;
  loading: boolean;
  error: any | null;
  autoMode: boolean;
  autoAbort: AbortController | null;

  startSession: (storyId: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  sendMessage: (text: string, ephemeralOOC?: string) => Promise<void>;
  setPersistentOOC: (text: string) => Promise<void>;
  toggleCharacter: (charId: string, on: boolean) => Promise<void>;
  loadStoryCharacters: () => Promise<void>;
  addTempCharacter: (name: string, desc: string) => Promise<string | undefined>;
  setInputLocked: (v: boolean) => void;
  appendAssistantBubble: (msg: ChatMessage) => void;
  enqueueAssistantBatch: (messages: ChatMessage[]) => void;
  pushEphemeralOOC: (text: string) => Promise<void>;
  enterAutoMode: () => void;
  exitAutoMode: () => void;
  reset: () => void;
}

// Helper mapping từ MessageDto của server sang ChatMessage của client
export function mapDtoToChatMessage(dto: MessageDto | JournalMessageDto, index: number): ChatMessage {
  const baseId = ('id' in dto && typeof dto.id === 'string' && dto.id) ? dto.id : `${dto.role}_${dto.timestamp || Date.now()}_${index}`;
  
  if (dto.role === 'user') {
    return {
      kind: 'user',
      id: baseId,
      text: dto.text,
      timestamp: dto.timestamp,
    };
  } else if (dto.role === 'assistant') {
    return {
      kind: 'assistant',
      id: baseId,
      characterId: 'characterId' in dto ? (dto.characterId ?? null) : null,
      characterName: dto.characterName ?? 'Nhân vật',
      text: dto.text,
      translation: dto.translation,
      emotion: dto.emotion,
      intensity: dto.intensity,
      words: dto.words,
      shopEvent: dto.shopEvent,
      timestamp: dto.timestamp,
    };
  } else if (dto.role === 'persistent_ooc' || dto.role === 'ephemeral_ooc') {
    return {
      kind: dto.role as 'persistent_ooc' | 'ephemeral_ooc',
      id: baseId,
      text: dto.text,
      timestamp: dto.timestamp,
    };
  } else {
    return {
      kind: 'system',
      id: baseId,
      text: dto.text,
      timestamp: dto.timestamp,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers for auto mode loop
// ---------------------------------------------------------------------------
function _delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

function _raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((res, rej) => {
    p.then(res, rej);
    signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: null,
  storyId: null,
  messages: [],
  activeCharacters: [],
  persistentOOC: '',
  temporaryCharacters: [],
  charactersFull: [],
  inputLocked: false,
  loading: false,
  error: null,
  autoMode: false,
  autoAbort: null,

  startSession: async (storyId: string) => {
    set({ loading: true, error: null, storyId });
    try {
      const res = await chatService.startSession(storyId);
      set({
        sessionId: res.sessionId,
        activeCharacters: res.initialActiveCharacters || [],
      });
    } catch (e: any) {
      set({ error: e });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  loadHistory: async () => {
    const sid = get().sessionId;
    if (!sid) return;
    set({ loading: true, error: null });
    try {
      const history = await chatService.getHistory(sid);
      const mapped = (history.messages || []).map((m, i) => mapDtoToChatMessage(m, i));
      set({
        messages: mapped,
        persistentOOC: history.persistentOOC || '',
        activeCharacters: history.activeCharacters || [],
      });
    } catch (e: any) {
      set({ error: e });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  sendMessage: async (text: string, ephemeralOOC?: string) => {
    const sid = get().sessionId;
    if (!sid) return;

    // Optimistic UI updates
    const userMsgId = `tmp_user_${Date.now()}`;
    const userMsg: ChatMessage = {
      kind: 'user',
      id: userMsgId,
      text,
      timestamp: Date.now(),
    };

    const newMsgs = [...get().messages, userMsg];

    if (ephemeralOOC && ephemeralOOC.trim()) {
      newMsgs.push({
        kind: 'ephemeral_ooc',
        id: `tmp_eph_${Date.now()}`,
        text: ephemeralOOC,
        timestamp: Date.now(),
      });
    }

    set({
      messages: newMsgs,
      inputLocked: true,
      error: null,
    });

    try {
      const batch = await chatService.sendMessage(sid, text, ephemeralOOC);
      
      // Chuyển đổi AssistantMessageDto[] từ server thành ChatMessage[]
      const assistantMsgs: ChatMessage[] = (batch.messages || []).map((m) => ({
        kind: 'assistant',
        id: m.id,
        characterId: m.characterId,
        characterName: m.characterName || 'Nhân vật',
        text: m.text,
        translation: m.translation,
        emotion: m.emotion,
        intensity: m.intensity,
        words: m.words,
        shopEvent: m.shopEvent,
        timestamp: m.timestamp || Date.now(),
      }));

      get().enqueueAssistantBatch(assistantMsgs);
    } catch (e: any) {
      set({ error: e, inputLocked: false });
      throw e;
    }
  },

  setInputLocked: (v: boolean) => set({ inputLocked: v }),

  appendAssistantBubble: (msg: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages, msg],
    }));
  },

  enqueueAssistantBatch: (messages: ChatMessage[]) => {
    const manager = getPlaybackManagerSingleton();
    if (manager) {
      manager.enqueueBatch(messages);
    } else {
      // Fallback khi không có manager (ví dụ trong môi trường test hoặc không khởi tạo)
      set((state) => ({
        messages: [...state.messages, ...messages],
        inputLocked: false,
      }));
    }
  },

  pushEphemeralOOC: async (text: string) => {
    const sid = get().sessionId;
    if (!sid) return;
    try {
      await chatService.setOoc(sid, 'ephemeral', text);
      set((state) => ({
        messages: [
          ...state.messages,
          {
            kind: 'ephemeral_ooc',
            id: `tmp_eph_${Date.now()}`,
            text: text,
            timestamp: Date.now(),
          },
        ],
      }));
    } catch (e: any) {
      set({ error: e });
      throw e;
    }
  },

  setPersistentOOC: async (text: string) => {
    const sid = get().sessionId;
    if (!sid) return;
    try {
      await chatService.setOoc(sid, 'persistent', text);
      set((state) => ({
        persistentOOC: text,
        messages: [
          ...state.messages,
          {
            kind: 'persistent_ooc',
            id: `tmp_p_ooc_${Date.now()}`,
            text: text,
            timestamp: Date.now(),
          },
        ],
      }));
    } catch (e: any) {
      set({ error: e });
      throw e;
    }
  },

  toggleCharacter: async (charId: string, on: boolean) => {
    const sid = get().sessionId;
    if (!sid) return;
    try {
      await chatService.toggleCharacter(sid, charId, on);
      set((state) => {
        const updated = on
          ? Array.from(new Set([...state.activeCharacters, charId]))
          : state.activeCharacters.filter((id) => id !== charId);
        return { activeCharacters: updated };
      });
    } catch (e: any) {
      set({ error: e });
      throw e;
    }
  },

  loadStoryCharacters: async () => {
    const storyId = get().storyId;
    if (!storyId) return;
    try {
      const chars = await characterApi.listByStory(storyId);
      set({ charactersFull: chars || [] });
    } catch (e: any) {
      console.error('Failed to load story characters:', e);
      throw e;
    }
  },

  addTempCharacter: async (name: string, desc: string) => {
    const sid = get().sessionId;
    if (!sid) return;
    try {
      const res = await chatService.addTempCharacter(sid, name, desc);
      set((state) => ({
        temporaryCharacters: [
          ...state.temporaryCharacters,
          { tempId: res.tempId, name, description: desc },
        ],
        messages: [
          ...state.messages,
          {
            kind: 'system',
            id: `tmp_sys_temp_char_${Date.now()}`,
            text: `Nhân vật tạm thời "${name}" vừa được thêm: ${desc}`,
            timestamp: Date.now(),
          },
        ],
      }));
      return res.tempId;
    } catch (e: any) {
      set({ error: e });
      throw e;
    }
  },

  enterAutoMode: () => {
    if (get().autoMode) return;
    const abort = new AbortController();
    set({ autoMode: true, inputLocked: true, autoAbort: abort });
    void (async () => {
      const signal = abort.signal;
      while (get().autoMode && !signal.aborted) {
        try {
          const sid = get().sessionId;
          if (!sid) break;
          const batch = await chatService.postAutoContinue(sid, signal);

          const hasShopEvent = batch.messages.some((m) => m.shopEvent != null);

          const assistantMsgs: import('../types/message').ChatMessage[] = (batch.messages || []).map((m) => ({
            kind: 'assistant' as const,
            id: m.id,
            characterId: m.characterId,
            characterName: m.characterName || 'Nhân vật',
            text: m.text,
            translation: m.translation,
            emotion: m.emotion,
            intensity: m.intensity,
            words: m.words,
            shopEvent: m.shopEvent,
            timestamp: m.timestamp || Date.now(),
          }));

          get().enqueueAssistantBatch(assistantMsgs);

          const mgr = getPlaybackManagerSingleton();
          if (mgr) {
            await _raceAbort(mgr.waitForQueueFinish(), signal);
          }
          if (signal.aborted) break;

          if (hasShopEvent) {
            get().exitAutoMode();
            break;
          }

          await _delay(2000, signal);
          if (signal.aborted) break;
        } catch (e: any) {
          if (e?.name === 'AbortError') break;
          console.warn('[auto loop error]', e);
          const msg = e?.message ?? 'unknown';
          Alert.alert('Auto mode dừng', `Lỗi: ${msg}`);
          get().exitAutoMode();
          break;
        }
      }
      // Ensure cleanup if loop exits without explicit exitAutoMode
      if (get().autoMode) {
        set({ autoMode: false, inputLocked: false, autoAbort: null });
      }
    })();
  },

  exitAutoMode: () => {
    if (!get().autoMode) return;
    get().autoAbort?.abort();
    set({ autoMode: false, inputLocked: false, autoAbort: null });
  },

  reset: () =>
    set({
      sessionId: null,
      storyId: null,
      messages: [],
      activeCharacters: [],
      persistentOOC: '',
      temporaryCharacters: [],
      charactersFull: [],
      inputLocked: false,
      loading: false,
      error: null,
      autoMode: false,
      autoAbort: null,
    }),
}));
