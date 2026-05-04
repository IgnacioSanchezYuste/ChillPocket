export type ThemeMode = 'light' | 'dark';

export type Palette = {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverted: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
};

export const lightPalette: Palette = {
  bgBase: '#FAFAFA',
  bgSurface: '#FFFFFF',
  bgElevated: '#F4F4F5',
  borderSubtle: '#E4E4E7',
  borderStrong: '#D4D4D8',
  textPrimary: '#09090B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  textInverted: '#FAFAFA',
  accent: '#6366F1',
  accentSoft: '#EEF2FF',
  success: '#10B981',
  successSoft: '#ECFDF5',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
};

export const darkPalette: Palette = {
  bgBase: '#0A0A0B',
  bgSurface: '#141416',
  bgElevated: '#1C1C1F',
  borderSubtle: '#27272A',
  borderStrong: '#3F3F46',
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textInverted: '#09090B',
  accent: '#818CF8',
  accentSoft: '#1E1B4B',
  success: '#34D399',
  successSoft: '#022C22',
  danger: '#F87171',
  dangerSoft: '#3B0F0F',
  warning: '#FBBF24',
  warningSoft: '#3B2A0F',
};

export const getPalette = (mode: ThemeMode): Palette =>
  mode === 'dark' ? darkPalette : lightPalette;

export const categoryDotPalette = [
  '#6366F1',
  '#F97316',
  '#10B981',
  '#EC4899',
  '#3B82F6',
  '#8B5CF6',
  '#14B8A6',
  '#EF4444',
  '#F59E0B',
  '#0EA5E9',
  '#84CC16',
  '#A855F7',
];
