import { create } from 'zustand';
import { BalanceDto } from '@chatai/shared-types';
import { apiClient } from '../../../api/client';

interface WalletState {
  balance: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setBalance: (n: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const res = await apiClient.get<BalanceDto>('/shop/balance');
      set({ balance: res.gems });
    } catch (e) {
      console.warn('[WalletStore] refresh failed', e);
    } finally {
      set({ loading: false });
    }
  },

  setBalance: (n: number) => set({ balance: n }),
}));
