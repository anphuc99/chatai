import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useChatStore } from '../store/chat.store';

/**
 * Exits auto mode when the app moves to the background, to avoid battery drain.
 * Call this hook once inside ChatRoomScreen.
 */
export function useAppStateAutoExit() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && useChatStore.getState().autoMode) {
        useChatStore.getState().exitAutoMode();
      }
    });
    return () => sub.remove();
  }, []);
}
