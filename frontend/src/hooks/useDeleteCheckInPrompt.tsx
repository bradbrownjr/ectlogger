import { useCallback, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

// ========== DELETE CHECK-IN PROMPT ==========
// Confirms a check-in's Delete button. For net control
// (NetActions.block_station) it also offers Remove and block: take the
// station off the net and keep it from checking itself back in
// (backend routers/net_blocks.py). Promise-based so the shared check-in
// handlers (checkInActions.ts) can await the answer the way they awaited
// window.confirm; the page renders `dialog`.

export type DeleteCheckInChoice = 'delete' | 'block' | null;

interface Pending {
  callsign: string;
  // More than one: every check-in for one station at one place (its row
  // in the check-in list, utils/stationRows.ts).
  count: number;
  resolve: (choice: DeleteCheckInChoice) => void;
}

export function useDeleteCheckInPrompt(canBlock: boolean) {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (checkIn: { callsign: string }, count = 1) =>
      new Promise<DeleteCheckInChoice>((resolve) => setPending({ callsign: checkIn.callsign, count, resolve })),
    [],
  );

  const finish = (choice: DeleteCheckInChoice) => {
    pending?.resolve(choice);
    setPending(null);
  };

  const dialog = (
    <Dialog open={!!pending} onClose={() => finish(null)} maxWidth="xs" fullWidth>
      <DialogTitle>
        {(pending?.count ?? 1) > 1 ? `Delete ${pending?.callsign}'s ${pending?.count} check-ins here?` : `Delete ${pending?.callsign}'s check-in?`}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {(pending?.count ?? 1) > 1
            ? `Delete removes all ${pending?.count} of ${pending?.callsign}'s check-ins at this place from the log. To remove just one, open its timeline instead.`
            : 'Delete removes this check-in from the log.'}
        </DialogContentText>
        {canBlock && (
          <DialogContentText sx={{ mt: 1.5 }}>
            Remove and block takes {pending?.callsign} off this net: every check-in under that callsign is removed,
            its chat is muted for everyone, and it can't check itself back in. Net control can still check it in.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => finish(null)}>Cancel</Button>
        {canBlock && (
          <Button color="error" variant="outlined" onClick={() => finish('block')}>Remove and block</Button>
        )}
        <Button color="error" variant="contained" onClick={() => finish('delete')} autoFocus>Delete</Button>
      </DialogActions>
    </Dialog>
  );

  return { ask, dialog };
}
