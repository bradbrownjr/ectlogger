import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { netApi } from '../../services/api';
import TrafficComposer from '../traffic/TrafficComposer';
import { useFormDefinitions } from '../../hooks/useFormDefinitions';

// ========== FILE TRAFFIC DIALOG ==========
// Composing a piece of traffic for a net. Deliberately a dialog rather than
// an inline mode in the Traffic panel: that panel is often narrow and docked
// beside the check-in list, and a Radiogram needs real room.
//
// Owned by the HOST PAGE (NetView, NetPaneWindow), never by TrafficPanel,
// for the same reason every other net dialog is -- CheckInFormDialog,
// CanHearDialog, RoleAssignmentDialog all live at page level. The Traffic
// panel itself is mounted inside the docked column or a FloatingWindow, and
// those two are different React subtrees: crossing the xl breakpoint (a
// window resize, a laptop meeting an external monitor) unmounts one and
// mounts the other. A dialog owned by the panel went with it, taking a
// half-typed radiogram along. At page level it simply stays open.
//
// Filing dispatches `netTrafficFiled` on window rather than calling back into
// the panel, which may be a sibling, a floating window, or not mounted at
// all. TrafficPanel already listens for the WebSocket-driven `trafficLogged`
// / `trafficLogChanged` events the same way; this is the local-origin one,
// and it carries form_id so the panel can open what was just filed.

interface FileTrafficDialogProps {
  netId: number;
  // The net, when the host already has it (both hosts do, via useNetData).
  // Supplies the net's traffic restrictions and strip template; the dialog
  // fetches it only if the host cannot supply it.
  net?: any | null;
  open: boolean;
  onClose: () => void;
}

const FileTrafficDialog: React.FC<FileTrafficDialogProps> = ({ netId, net, open, onClose }) => {
  const { definitions } = useFormDefinitions();
  const [fetchedNet, setFetchedNet] = useState<any | null>(null);
  const netConfig = net ?? fetchedNet;

  useEffect(() => {
    if (!open || net) return;
    let cancelled = false;
    netApi.get(netId)
      .then((res) => { if (!cancelled) setFetchedNet(res.data); })
      // Without it the composer just offers every form type, which is a
      // usable fallback -- never a reason to block filing.
      .catch(() => { if (!cancelled) setFetchedNet(null); });
    return () => { cancelled = true; };
  }, [open, net, netId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        File traffic
        <IconButton onClick={onClose} title="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TrafficComposer
          definitions={definitions}
          netId={netId}
          allowedFormTypes={netConfig?.traffic_form_types}
          // TrafficComposer resolves whether stripFormType actually points at
          // a real structured type; stripTemplateRaw is only the fallback for
          // when it doesn't.
          stripFormType={netConfig?.traffic_strip_form_type}
          stripTemplateRaw={netConfig?.traffic_strip_template}
          contextLabel={netConfig ? `Filing for ${netConfig.name}` : undefined}
          onCreated={(id) => {
            onClose();
            window.dispatchEvent(new CustomEvent('netTrafficFiled', {
              detail: { net_id: netId, form_id: id },
            }));
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default FileTrafficDialog;
