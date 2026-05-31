import { useChatStore } from '../store/chat.store';

export function useChat() {
  const sessionId = useChatStore((state) => state.sessionId);
  const storyId = useChatStore((state) => state.storyId);
  const messages = useChatStore((state) => state.messages);
  const activeCharacters = useChatStore((state) => state.activeCharacters);
  const persistentOOC = useChatStore((state) => state.persistentOOC);
  const inputLocked = useChatStore((state) => state.inputLocked);
  const loading = useChatStore((state) => state.loading);
  const error = useChatStore((state) => state.error);

  const startSession = useChatStore((state) => state.startSession);
  const loadHistory = useChatStore((state) => state.loadHistory);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const setPersistentOOC = useChatStore((state) => state.setPersistentOOC);
  const toggleCharacter = useChatStore((state) => state.toggleCharacter);
  const addTempCharacter = useChatStore((state) => state.addTempCharacter);
  const reset = useChatStore((state) => state.reset);

  return {
    sessionId,
    storyId,
    messages,
    activeCharacters,
    persistentOOC,
    inputLocked,
    loading,
    error,
    startSession,
    loadHistory,
    sendMessage,
    setPersistentOOC,
    toggleCharacter,
    addTempCharacter,
    reset,
  };
}

export default useChat;
