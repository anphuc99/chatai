import * as SecureStore from 'expo-secure-store';

const KEY_TOKEN = 'chatai_id_token';

export const secureStorage = {
  async saveToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(KEY_TOKEN, token);
    } catch (error) {
      console.error('[SecureStorage] Error saving token:', error);
      throw error;
    }
  },

  async loadToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEY_TOKEN);
    } catch (error) {
      console.error('[SecureStorage] Error loading token:', error);
      return null;
    }
  },

  async deleteToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY_TOKEN);
    } catch (error) {
      console.error('[SecureStorage] Error deleting token:', error);
      throw error;
    }
  },
};
