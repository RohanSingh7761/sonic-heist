// Colour tokens and moods from apps/web/src/ui/pixel.css.
export const C = {
  cream: '#fff4e4',
  paper: '#fffaf1',
  sand: '#f3e4cb',
  ink: '#2a2230',
  muted: '#75654f',
  red: '#e5484d',
  redDark: '#a92f3c',
  pink: '#ffc2bd',
  gold: '#f7c948',
  goldDark: '#c98a1b',
  teal: '#2fb3ad',
  tealDark: '#1c7f79',
  mint: '#5ec9a7',
  night: '#2b2036',
  plum: '#4a3550',
  disabled: '#e4d9c6',
  disabledText: '#85796a',
  pressed: '#ffe6b8',
};
export const U = 3; // one chunky UI pixel

export type Mood = 'cream' | 'night' | 'red' | 'gold' | 'blue' | 'mint' | 'dark';
export const MOODS: Record<Mood, { bg: string; fg: string; muted: string; dark: boolean }> = {
  cream: { bg: C.cream, fg: C.ink, muted: C.muted, dark: false },
  night: { bg: C.night, fg: C.paper, muted: '#d6cbd9', dark: true },
  red: { bg: '#6d1f2c', fg: C.paper, muted: '#d6cbd9', dark: true },
  gold: { bg: '#ffe6a3', fg: C.ink, muted: C.muted, dark: false },
  blue: { bg: '#c7d9e8', fg: C.ink, muted: C.muted, dark: false },
  mint: { bg: '#cdeedd', fg: C.ink, muted: C.muted, dark: false },
  dark: { bg: '#3a3142', fg: C.paper, muted: '#d6cbd9', dark: true },
};

export const FONT = 'Jersey15_400Regular';
