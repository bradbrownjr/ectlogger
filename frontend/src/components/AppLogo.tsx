import React from 'react';

interface AppLogoProps {
  size?: number;
  /** 'default' = light background, 'nav' = blue/dark toolbar, 'dark' = dark-mode card */
  variant?: 'default' | 'nav' | 'dark';
}

const AppLogo: React.FC<AppLogoProps> = ({ size = 32, variant = 'default' }) => {
  const isNav  = variant === 'nav';
  const isDark = variant === 'dark';

  const borderColor  = isNav  ? 'white'               : isDark ? '#2e7d32' : '#1a6b2e';
  const bgFill       = isNav  ? 'rgba(255,255,255,0.15)' : isDark ? '#1e1e1e' : 'white';
  const ringColor    = isNav  ? 'rgba(255,255,255,0.3)'  : isDark ? '#2e4d2e' : '#b2dfb2';
  const antColor     = isNav  ? 'rgba(255,255,255,0.7)'  : isDark ? '#607d8b' : '#90a4ae';
  const antColor2    = isNav  ? 'rgba(255,255,255,0.6)'  : isDark ? '#546e7a' : '#78909c';
  const dotColor     = isNav  ? '#69f0ae' : '#4caf50';
  const dotColor2    = isNav  ? '#69f0ae' : isDark ? '#66bb6a' : '#81c784';
  const checkShadow  = isNav  ? 'rgba(0,80,0,0.5)'  : isDark ? '#1b5e20' : '#2e7d32';
  const checkMain    = isNav  ? '#69f0ae' : isDark ? '#66bb6a' : '#43a047';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-label="ECTLogger logo"
      role="img"
    >
      <circle cx="100" cy="100" r="92" fill={bgFill} stroke={borderColor} strokeWidth="9"/>

      <circle cx="100" cy="100" r="68" fill="none" stroke={ringColor} strokeWidth="1.5"/>
      <circle cx="100" cy="100" r="47" fill="none" stroke={ringColor} strokeWidth="1.5"/>
      <circle cx="100" cy="100" r="26" fill="none" stroke={ringColor} strokeWidth="1.5"/>

      <line x1="100" y1="165" x2="100" y2="38"  stroke={antColor}  strokeWidth="4.5" strokeLinecap="round"/>
      <line x1="88"  y1="58"  x2="112" y2="58"  stroke={antColor}  strokeWidth="3"   strokeLinecap="round"/>
      <line x1="84"  y1="74"  x2="116" y2="74"  stroke={antColor2} strokeWidth="2.5" strokeLinecap="round"/>

      <circle cx="100" cy="38"  r="5.5" fill={dotColor}/>
      <circle cx="100" cy="100" r="4"   fill={antColor2}/>
      <circle cx="100" cy="165" r="4"   fill={antColor2}/>
      <circle cx="152" cy="72"  r="5.5" fill={dotColor}/>
      <circle cx="56"  cy="62"  r="5.5" fill={dotColor}/>
      <circle cx="48"  cy="138" r="5.5" fill={dotColor}/>
      <circle cx="155" cy="130" r="4"   fill={dotColor2} opacity="0.7"/>
      <circle cx="100" cy="32"  r="4"   fill={dotColor2} opacity="0.7"/>

      <path d="M 52 112 L 84 148 L 162 58" fill="none" stroke={checkShadow} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 52 112 L 84 148 L 162 58" fill="none" stroke={checkMain}   strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export default AppLogo;
