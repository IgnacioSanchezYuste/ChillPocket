import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/endpoints';
import { TOKEN_KEY } from '../api/http';
import type { User } from '../api/types';

const USER_KEY = '@finanzas:user';

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; currency?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  bootstrapped: false,

  bootstrap: async () => {
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      if (token && userJson) {
        set({ token, user: JSON.parse(userJson) });
        try {
          const fresh = await authApi.me();
          set({ user: fresh });
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
        } catch {
          // token inválido → limpiar
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
          set({ token: null, user: null });
        }
      }
    } finally {
      set({ bootstrapped: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.login({ email, password });
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      set({ token: res.token, user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  register: async (data) => {
    set({ loading: true });
    try {
      const res = await authApi.register(data);
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      set({ token: res.token, user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    set({ token: null, user: null });
  },

  refreshUser: async () => {
    if (!get().token) return;
    const fresh = await authApi.me();
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
    set({ user: fresh });
  },

  setUser: (user) => {
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
}));
