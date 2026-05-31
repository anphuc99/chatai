import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../store/chat.store';

export function useChat() {
  return useChatStore(
    useShallow((state) => ({
      sessionId: state.sessionId,
      storyId: state.storyId,
      messages: state.messages,
      activeCharacters: state.activeCharacters,
      persistentOOC: state.persistentOOC,
      inputLocked: state.inputLocked,
      loading: state.loading,
      error: state.error,
      startSession: state.startSession,
      loadHistory: state.loadHistory,
      sendMessage: state.sendMessage,
      setPersistentOOC: state.setPersistentOOC,
      toggleCharacter: state.toggleCharacter,
      addTempCharacter: state.addTempCharacter,
      reset: state.reset,
    }))
  );
}

export default useChat;
