import React from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import { LOGO_DARK, LOGO_LIGHT, LOGO_VIEWBOX, logoMarkMarkup } from './brand/logo';

interface AppLogoProps {
  size?: number;
  /**
   * Which palette of the mark (components/brand/logo.ts) to draw:
   * - 'auto' (default): follows light/dark mode.
   * - 'light': always the cream-faced mark, for white paper (reports, PDFs).
   * - 'nav': the navigation bar. Follows the mode like 'auto' (the light mark
   *   is a solid badge, so it reads on every theme's colored bar), and gives an
   *   uploaded custom logo a backing plate.
   */
  variant?: 'auto' | 'light' | 'nav';
}

const AppLogo: React.FC<AppLogoProps> = ({ size = 32, variant = 'auto' }) => {
  const { customLogoUrl, mode } = useThemeMode();
  const isNav = variant === 'nav';

  if (customLogoUrl) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          boxSizing: 'border-box',
          ...(isNav ? { backgroundColor: 'rgba(255,255,255,0.9)', padding: Math.round(size * 0.12) } : {}),
        }}
      >
        <img
          src={customLogoUrl}
          alt="ECTLogger logo"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </span>
    );
  }

  const palette = variant === 'light' || mode !== 'dark' ? LOGO_LIGHT : LOGO_DARK;

  // Static, trusted markup from brand/logo.ts; the same markup the favicon,
  // email and printed-script copies are generated from.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOGO_VIEWBOX}
      width={size}
      height={size}
      aria-label="ECTLogger logo"
      role="img"
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: logoMarkMarkup(palette) }}
    />
  );
};

export default AppLogo;
