// Named color themes. Each bundles a light/dark variant pair so the existing
// dark/light mode toggle (ThemeContext.mode) keeps working independently of
// which named theme is active. Palettes are curated from Jam3/nice-color-palettes
// (MIT, attributed in AboutModal.tsx) - two of each palette's five hues become
// primary/secondary; backgrounds are hand-tuned neutrals tinted toward the hue.
export interface ThemeVariant {
  primary: string;
  secondary: string;
  background: string;
  paper: string;
}

export interface ThemeDefinition {
  name: string;
  light: ThemeVariant;
  dark: ThemeVariant;
}

export const DEFAULT_THEME_KEY = 'ectlogger-blue';

export const THEMES: Record<string, ThemeDefinition> = {
  'ectlogger-blue': {
    name: 'ECTLogger Blue',
    light: { primary: '#1976d2', secondary: '#dc004e', background: '#e8eef4', paper: '#ffffff' },
    dark: { primary: '#90caf9', secondary: '#f48fb1', background: '#121212', paper: '#1e1e1e' },
  },
  ocean: {
    name: 'Ocean',
    light: { primary: '#00a8c6', secondary: '#8fbe00', background: '#e6f4f6', paper: '#ffffff' },
    dark: { primary: '#40c0cb', secondary: '#aee239', background: '#0d2428', paper: '#123238' },
  },
  forest: {
    name: 'Forest',
    light: { primary: '#519548', secondary: '#1b676b', background: '#eef6e9', paper: '#ffffff' },
    dark: { primary: '#88c425', secondary: '#2f8f95', background: '#14231a', paper: '#1a2e21' },
  },
  sunset: {
    name: 'Sunset',
    light: { primary: '#fc913a', secondary: '#ff4e50', background: '#fff6ec', paper: '#ffffff' },
    dark: { primary: '#fc913a', secondary: '#f9d423', background: '#2b1810', paper: '#35201a' },
  },
  berry: {
    name: 'Berry',
    light: { primary: '#bd1550', secondary: '#8a9b0f', background: '#f9ecf1', paper: '#ffffff' },
    dark: { primary: '#e05a8e', secondary: '#c7d94a', background: '#241019', paper: '#2e1420' },
  },
};
