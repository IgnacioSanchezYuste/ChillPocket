import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkPalette, getPalette, lightPalette, Palette, ThemeMode } from './colors';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  palette: Palette;
  setPreference: (pref: ThemePreference) => Promise<void>;
};

const STORAGE_KEY = '@finanzas:theme';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  preference: 'system',
  palette: lightPalette,
  setPreference: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const setPreference = async (pref: ThemePreference) => {
    setPref(pref);
    await AsyncStorage.setItem(STORAGE_KEY, pref);
  };

  const mode: ThemeMode = useMemo(() => {
    if (preference === 'system') return (system ?? Appearance.getColorScheme() ?? 'light') as ThemeMode;
    return preference;
  }, [preference, system]);

  const value: ThemeContextValue = useMemo(
    () => ({ mode, preference, palette: getPalette(mode), setPreference }),
    [mode, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
export { darkPalette, lightPalette };
