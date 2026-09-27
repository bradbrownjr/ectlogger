import React from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import {
  WORDMARK_ASPECT,
  WORDMARK_DARK,
  WORDMARK_ECT_PATH,
  WORDMARK_LIGHT,
  WORDMARK_LOGGER_PATH,
  WORDMARK_ON_COLOR,
  WORDMARK_TRANSFORM,
  WORDMARK_VIEWBOX,
} from './brand/logo';

// ========== ECTLOGGER WORDMARK ==========
// The name as drawn lettering (components/brand/logo.ts), always beside
// AppLogo (DESIGN.md "Branding").
//
// - 'auto': green-and-slate on light surfaces, green-and-off-white on dark.
// - 'nav': the navigation bar. White in light mode, where the bar takes the
//   named theme's color: white is the one text color that doesn't clash with
//   any of them. In dark mode the bar is neutral, so it gets the dark colors.

interface AppWordmarkProps {
  height?: number;
  variant?: 'auto' | 'nav';
}

const AppWordmark: React.FC<AppWordmarkProps> = ({ height = 24, variant = 'auto' }) => {
  const { mode } = useThemeMode();
  const colors = mode === 'dark'
    ? WORDMARK_DARK
    : variant === 'nav' ? WORDMARK_ON_COLOR : WORDMARK_LIGHT;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={WORDMARK_VIEWBOX}
      height={height}
      width={Math.round(height * WORDMARK_ASPECT)}
      role="img"
      aria-label="ECTLogger"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <g transform={WORDMARK_TRANSFORM}>
        <path fill={colors.ect} d={WORDMARK_ECT_PATH} />
        <path fill={colors.logger} d={WORDMARK_LOGGER_PATH} />
      </g>
    </svg>
  );
};

export default AppWordmark;
