import { createContext, useContext } from 'react';
import { PaletteMode } from '@mui/material';
import { DEFAULT_THEME_KEY, ThemeDefinition } from '../theme/themes';

interface ThemeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
  // System-wide default theme key (from GET /settings/theme). Used to render
  // logged-out visitors and any user with no personal theme preference, and
  // updated immediately after an admin changes it in AdminBrandingTab so
  // their own session reflects the change without a reload.
  systemDefaultTheme: string;
  setSystemDefaultTheme: (key: string) => void;
  // Admin-defined instance theme (Admin -> Branding), or null if unset. Not
  // in the static THEMES record since it's per-instance runtime data - shows
  // up as a 6th swatch (key 'custom') wherever THEMES itself is rendered.
  customTheme: ThemeDefinition | null;
  setCustomTheme: (theme: ThemeDefinition | null) => void;
  // Uploaded instance logo URL, or null to use the built-in SVG mark.
  customLogoUrl: string | null;
  setCustomLogoUrl: (url: string | null) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleColorMode: () => {},
  systemDefaultTheme: DEFAULT_THEME_KEY,
  setSystemDefaultTheme: () => {},
  customTheme: null,
  setCustomTheme: () => {},
  customLogoUrl: null,
  setCustomLogoUrl: () => {},
});

export const useThemeMode = () => useContext(ThemeContext);
