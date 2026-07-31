import { createContext, useContext } from 'react';
import { PaletteMode } from '@mui/material';
import { DEFAULT_THEME_KEY } from '../theme/themes';

interface ThemeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
  // System-wide default theme key (from GET /settings/theme). Used to render
  // logged-out visitors and any user with no personal theme preference, and
  // updated immediately after an admin changes it in AdminThemeTab so their
  // own session reflects the change without a reload.
  systemDefaultTheme: string;
  setSystemDefaultTheme: (key: string) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleColorMode: () => {},
  systemDefaultTheme: DEFAULT_THEME_KEY,
  setSystemDefaultTheme: () => {},
});

export const useThemeMode = () => useContext(ThemeContext);
