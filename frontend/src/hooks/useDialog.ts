import { useState, useCallback } from 'react';

export interface UseDialogResult {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Manages a single boolean open/close dialog flag.
 * Replaces the repetitive `const [xOpen, setXOpen] = useState(false)` +
 * separate open/close handler pattern for MUI Dialog, Drawer, and Popover.
 *
 * Usage:
 *   const map = useDialog();
 *   <Button onClick={map.onOpen}>Open Map</Button>
 *   <MapDialog open={map.open} onClose={map.onClose} />
 */
function useDialog(): UseDialogResult {
  const [open, setOpen] = useState(false);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  return { open, onOpen, onClose };
}

export default useDialog;
