import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';
import { EXPORT_UNBOUND_ATTR } from './pdfExport';

// ========== FROZEN TABLE ==========
// A table whose heading row and first column stay in view while it scrolls
// down or to the right, so a cell deep in a wide grid still shows which row
// and column it belongs to (Brad, 2026-10-31, on the Station Coverage grids).
//
// The table scrolls inside its own box. A browser can't pin a heading
// against an outer scroller once the table also scrolls sideways (overflow-x
// makes the table box the scroller for both directions), so the box gets a
// height limit: FROZEN_TABLE_MAX_HEIGHT of the nearest panel that declares
// itself a size container (frozenPanelSx), or of the window when there is
// none. Sticky cells need an opaque background, so the heading's tint is
// laid over the paper color rather than left see-through.
//
// Spread frozenTableProps on the TableContainer: its attribute tells the
// PDF export (utils/pdfExport.ts) to print the table whole.

export const FROZEN_TABLE_MAX_HEIGHT = '85cqh';

export const frozenTableProps = { [EXPORT_UNBOUND_ATTR]: '' };

// A tint as an opaque layer over the paper color, for a sticky cell
const tintOverPaper = (theme: Theme, tint: string) => ({
  backgroundColor: theme.palette.background.paper,
  backgroundImage: `linear-gradient(${tint}, ${tint})`,
});

// A row's stripe or highlight for its frozen first cell, which is opaque and
// would otherwise hide it. Set on the cell (sx); the table's own rule below
// reads it, so the two never fight over specificity.
export const frozenCellTint = (tint: string | null | undefined) => ({
  '--frozen-tint': tint ? `linear-gradient(${tint}, ${tint})` : 'none',
});

// fill: the panel's only table, in a flex column that doesn't scroll itself;
// the table takes whatever height the panel has left instead of a share.
export function frozenTableSx(theme: Theme, { fill = false }: { fill?: boolean } = {}): SystemStyleObject<Theme> {
  const edge = `inset -1px 0 0 ${theme.palette.divider}`;
  return {
    ...(fill ? { flex: '0 1 auto', minHeight: 0 } : { maxHeight: FROZEN_TABLE_MAX_HEIGHT }),
    overflow: 'auto',
    '& thead th': {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      ...tintOverPaper(theme, theme.palette.action.hover),
    },
    '& thead th:first-of-type': { left: 0, zIndex: 3, boxShadow: edge },
    '& tbody td:first-of-type': {
      position: 'sticky',
      left: 0,
      zIndex: 1,
      boxShadow: edge,
      backgroundColor: theme.palette.background.paper,
      backgroundImage: 'var(--frozen-tint, none)',
    },
  };
}

// On the panel a frozen table sits in, so FROZEN_TABLE_MAX_HEIGHT is a share
// of the panel rather than of the window. Only where the panel has a height of
// its own: a size container with an auto height collapses to nothing.
export const frozenPanelSx = { containerType: 'size' } as const;
