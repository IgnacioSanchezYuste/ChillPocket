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
  // Degradados (para expo-linear-gradient). Mín. 2 colores.
  gradientHero: string[];    // tarjeta pastel suave
  gradientApp: string[];     // fondo sutil de pantalla
  gradientAccent: string[];  // acentos / chips destacados
  gradientBalance: string[]; // tarjeta hero saldo (vibrante morado→azul)
  gradientFab: string[];     // botón flotante +
};

// === LIGHT · paleta pastel moderna ===
export const lightPalette: Palette = {
  bgBase: '#F7F7FD',
  bgSurface: '#FFFFFF',
  bgElevated: '#F0F1FB',
  borderSubtle: '#E8E8F6',
  borderStrong: '#D7D8EE',
  textPrimary: '#1B1B2F',
  textSecondary: '#5A5B78',
  textMuted: '#9C9DBA',
  textInverted: '#FAFAFF',
  accent: '#6C63F1',
  accentSoft: '#ECECFE',
  success: '#10B981',
  successSoft: '#E6F8F1',
  danger: '#F0556B',
  dangerSoft: '#FEECEF',
  warning: '#F5A623',
  warningSoft: '#FEF4E2',
  // Degradados pastel suaves (lavanda → violeta → cielo / menta)
  gradientHero: ['#E3E6FF', '#ECE6FE', '#E2F1FE'],
  gradientApp: ['#F8F7FE', '#F1F0FB'],
  gradientAccent: ['#A5B4FC', '#C4B5FD'],
  // Hero del saldo: morado eléctrico → índigo → azul violeta (texto en blanco)
  gradientBalance: ['#7C6CF7', '#6366F1', '#4F7DF6'],
  gradientFab: ['#7C6CF7', '#5B8DEF'],
};

// === DARK · más sobrio, sin pastel ===
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
  // Degradados oscuros sutiles
  gradientHero: ['#1E1B4B', '#171723'],
  gradientApp: ['#0A0A0B', '#0A0A0B'],
  gradientAccent: ['#3730A3', '#4C1D95'],
  // Hero del saldo: índigo profundo vibrante, texto en blanco
  gradientBalance: ['#4F46E5', '#4338CA', '#3B5BDB'],
  gradientFab: ['#6366F1', '#3B82F6'],
};

export const getPalette = (mode: ThemeMode): Palette =>
  mode === 'dark' ? darkPalette : lightPalette;

export const categoryDotPalette = [
  '#6C63F1',
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
