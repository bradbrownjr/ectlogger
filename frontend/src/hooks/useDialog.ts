import { useState, useCallback } from 'react';

export interface UseDialogResult {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  // Opens if closed, closes if already open. Toolbar buttons that open a
  // pane/dialog should wire onClick to this rather than onOpen, so clicking
  // the same button again closes what it opened instead of doing nothing --
  // onOpen itself stays "always open" for callers that need that (a deep
  // link, a "View X" action elsewhere) regardless of current state.
  onToggle: () => void;
}

/**
 * Manages a single boolean open/close dialog flag.
 * Replaces the repetitive `const [xOpen, setXOpen] = useState(false)` +
 * separate open/close handler pattern for MUI Dialog, Drawer, and Popover.
 *
 * Usage:
 *   const map = useDialog();
 *   <Button onClick={map.onToggle}>Open Map</Button>
 *   <MapDialog open={map.open} onClose={map.onClose} />
 */
function useDialog(): UseDialogResult {
  const [open, setOpen] = useState(false);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const onToggle = useCallback(() => setOpen((prev) => !prev), []);
  return { open, onOpen, onClose, onToggle };
}

export default useDialog;
