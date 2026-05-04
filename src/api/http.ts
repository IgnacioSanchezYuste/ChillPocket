import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOKEN_KEY = '@finanzas:token';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://ignaciosanchezyuste.es/API_Finanzas';

export const http = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (cb: () => void) => {
  onUnauthorized = cb;
};

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError<any>) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export function apiError(e: unknown, fallback = 'Error de red'): string {
  const err = e as AxiosError<any>;
  const status = err?.response?.status;
  const serverMsg = err?.response?.data?.message;
  if (serverMsg) return status ? `${serverMsg} (${status})` : serverMsg;
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
    return `No se pudo conectar a ${API_URL}`;
  }
  if (err?.code === 'ECONNABORTED') return 'La petición tardó demasiado (timeout)';
  if (status) return `Error HTTP ${status}`;
  return err?.message || fallback;
}
