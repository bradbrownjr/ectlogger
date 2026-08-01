import { useTheme, useMediaQuery } from '@mui/material';

export type LayoutTier = 'compact' | 'wide' | 'ultrawide';

// Coarse screen-size class used to keep resizable-pane sizes independent
// across very different devices - a phone, a laptop, an external ultrawide
// monitor - even when they happen to share the same browser profile (and
// therefore the same localStorage). 'compact' is everything below md
// (phones, narrow windows), 'wide' is md up to xl (most laptops/desktops),
// 'ultrawide' is xl+ (the only tier where the left dock column can appear).
export default function useLayoutTier(): LayoutTier {
  const theme = useTheme();
  const isXlUp = useMediaQuery(theme.breakpoints.up('xl'));
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  if (isXlUp) return 'ultrawide';
  if (isMdUp) return 'wide';
  return 'compact';
}
