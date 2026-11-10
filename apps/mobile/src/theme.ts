/** Design tokens from docs/DESIGN_GUIDE.md. Do not invent extra hues. */

export type ColorTokens = {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  line: string;
  teal: string;
  tealHover: string;
  tealSubtle: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  onAccent: string;
  overlay: string;
};

export const lightColors: ColorTokens = {
  canvas: '#EEF2F2',
  surface: '#FFFFFF',
  surfaceMuted: '#E7EDED',
  ink: '#1A2426',
  inkMuted: '#5C6B6E',
  line: '#D0DADA',
  teal: '#0E6B66',
  tealHover: '#0A524F',
  tealSubtle: '#E4F3F2',
  success: '#1B6B42',
  warning: '#8A4B08',
  danger: '#B42318',
  info: '#185FA5',
  onAccent: '#FFFFFF',
  overlay: 'rgba(26, 36, 38, 0.16)',
};

export const darkColors: ColorTokens = {
  canvas: '#141C1D',
  surface: '#1C2628',
  surfaceMuted: '#243032',
  ink: '#E8EEEE',
  inkMuted: '#9AA8AA',
  line: '#3D4C4E',
  teal: '#3D9E98',
  tealHover: '#2F7F7A',
  tealSubtle: '#1A3332',
  success: '#5BB07A',
  warning: '#D4A017',
  danger: '#E06B63',
  info: '#6BA3D4',
  onAccent: '#141C1D',
  overlay: 'rgba(0, 0, 0, 0.4)',
};

export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
  48: 48,
} as const;

export const radius = {
  control: 6,
  panel: 8,
  pill: 999,
} as const;

export const type = {
  caption: { fontSize: 12, lineHeight: 16, fontFamily: 'IBMPlexSans_400Regular' },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'IBMPlexSans_400Regular' },
  bodyComfortable: { fontSize: 16, lineHeight: 24, fontFamily: 'IBMPlexSans_400Regular' },
  label: { fontSize: 14, lineHeight: 20, fontFamily: 'IBMPlexSans_500Medium' },
  section: { fontSize: 18, lineHeight: 24, fontFamily: 'IBMPlexSans_600SemiBold' },
  page: { fontSize: 24, lineHeight: 32, fontFamily: 'IBMPlexSans_600SemiBold' },
  display: { fontSize: 32, lineHeight: 40, fontFamily: 'IBMPlexSans_600SemiBold' },
} as const;

export const touchMin = 48;

export type ThemePreference = 'light' | 'dark';

export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  devanagari: 'IBMPlexSansDevanagari_400Regular',
} as const;
