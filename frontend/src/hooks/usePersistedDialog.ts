import { useCallback } from 'react';
import useNetViewLayoutStorage from './useNetViewLayoutStorage';
import { UseDialogResult } from './useDialog';

// Same shape and contract as useDialog(), but the open flag survives
// navigating away and back (or a refresh) via useNetViewLayoutStorage -
// for on-demand Net View panes (Script, Announcements, Notes, Map) that
// should stay open like Chat/Activity Log already effectively do, subject
// to the user's "Remember Net View Layout" preference.
function usePersistedDialog(storageKey: string): UseDialogResult {
  const [open, setOpen] = useNetViewLayoutStorage<boolean>(storageKey, false);
  const onOpen = useCallback(() => setOpen(true), [setOpen]);
  const onClose = useCallback(() => setOpen(false), [setOpen]);
  return { open, onOpen, onClose };
}

export default usePersistedDialog;
