import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Link,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LanguageIcon from '@mui/icons-material/Language';
import EditIcon from '@mui/icons-material/Edit';
import { Link as RouterLink } from 'react-router-dom';
import { NetBlock, netBlockApi, templateApi, templateStaffApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatSchedule } from '../scheduler/ScheduleCard';
import { formatDateTime } from '../../utils/dateUtils';
import { formatFrequencyDisplay } from '../../utils/frequencyList';
import { subscribePath } from '../../utils/subscribeLink';
import ParticipantsOnlyChip from './ParticipantsOnlyChip';

// ========== NET INFO CARD ==========
// The toolbar's Net info: a card for the net, the way the profile popup is a
// card for an operator. Everyone can open it at every status, guests too, so
// it shows only what the net view and the schedule cards already make public
// (the staff list carries no email address, and a guest gets first names:
// routers/ncs_rotation.py::list_template_staff). Replaced the read-only copy
// of the Edit Net form that lived at /nets/{id}/info (2026-10-23), which was
// staff-only and vanished once the lobby opened.

interface StaffEntry {
  id: number;
  user_id: number | null;
  user_callsign?: string | null;
  user_name?: string | null;
  is_active: boolean;
}

interface NetInfoDialogProps {
  open: boolean;
  onClose: () => void;
  net: any;
  canEdit: boolean;
  // Net control (NetActions.block_station): lists the stations blocked from
  // this net, with Unblock.
  canBlock: boolean;
  preferUtc: boolean;
  // Opens the operator profile popup for a manager or staff member.
  onOpenProfile: (userId: number | null, callsign: string) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>{title}</Typography>
    {children}
  </Box>
);

const NetInfoDialog: React.FC<NetInfoDialogProps> = ({ open, onClose, net, canEdit, canBlock, preferUtc, onOpenProfile }) => {
  const [schedule, setSchedule] = useState<any>(null);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [blocks, setBlocks] = useState<NetBlock[]>([]);
  const [blockError, setBlockError] = useState<string | null>(null);
  const templateId: number | null = net?.template_id ?? null;

  // The schedule and its staff load when the card opens, not with the net.
  useEffect(() => {
    if (!open || !templateId) return;
    let cancelled = false;
    templateApi.get(templateId).then((r) => { if (!cancelled) setSchedule(r.data); }).catch(() => {});
    templateStaffApi.list(templateId).then((r) => { if (!cancelled) setStaff(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, templateId]);

  // Re-read on every open: blocks are added from the check-in list.
  useEffect(() => {
    if (!open || !canBlock || !net?.id) { setBlocks([]); return; }
    let cancelled = false;
    netBlockApi.list(net.id).then((r) => { if (!cancelled) setBlocks(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, canBlock, net?.id]);

  const unblock = async (block: NetBlock) => {
    setBlockError(null);
    try {
      await netBlockApi.unblock(block.net_id, block.id);
      setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    } catch (error) {
      setBlockError(getErrorMessage(error, `Couldn't unblock ${block.callsign}`));
    }
  };

  if (!net) return null;

  const isClosed = net.status === 'closed' || net.status === 'archived';
  const activeStaff = staff.filter((s) => s.is_active && s.user_callsign);
  const when = net.started_at
    ? `Started ${formatDateTime(net.started_at, preferUtc)}`
    : net.scheduled_start_time
    ? `Scheduled for ${formatDateTime(net.scheduled_start_time, preferUtc)}`
    : null;
  // An ad hoc schedule has no pattern worth repeating here.
  const pattern = schedule?.schedule_type && schedule.schedule_type !== 'ad_hoc' ? formatSchedule(schedule) : null;

  // A callsign that opens that operator's profile popup.
  const person = (userId: number | null, callsign: string, name?: string | null) => (
    <Link component="button" type="button" variant="body2" onClick={() => onOpenProfile(userId, callsign)} sx={{ verticalAlign: 'baseline' }}>
      {callsign}{name ? ` (${name})` : ''}
    </Link>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 3 } } }}>
      <IconButton onClick={onClose} size="small" aria-label="Close" sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}>
        <CloseIcon fontSize="small" />
      </IconButton>

      <DialogContent sx={{ pt: 2.5, pb: 2 }}>
        {/* ===== Header: logo, name, status ===== */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, pr: 4 }}>
          {net.logo_url && (
            <Avatar src={net.logo_url} alt="" variant="rounded" sx={{ width: 64, height: 64, flexShrink: 0, bgcolor: 'transparent' }} />
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{net.name}</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
              {net.participants_only && <ParticipantsOnlyChip />}
              <Chip size="small" label={String(net.status).toUpperCase()} />
              {/* The schedule's name, unless the net is simply named after it */}
              {schedule?.name && schedule.name !== net.name && <Chip size="small" variant="outlined" label={schedule.name} />}
            </Box>
          </Box>
        </Box>

        {net.description && (
          <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>{net.description}</Typography>
        )}

        <Divider sx={{ mb: 1.5 }} />

        {/* ===== When ===== */}
        {(when || pattern) && (
          <Section title="When">
            {when && <Typography variant="body2">{when}</Typography>}
            {pattern && <Typography variant="body2" color="text.secondary">{pattern}</Typography>}
          </Section>
        )}

        {/* ===== Frequencies (the net's communication plan) ===== */}
        {net.frequencies?.length > 0 && (
          <Section title="Frequencies">
            {net.frequencies.map((f: any) => (
              <Typography key={f.id} variant="body2">
                {/* A talkgroup names its network first: "Brandmeister 31234 DMR" */}
                {!f.frequency && f.network ? `${f.network} ` : ''}
                {formatFrequencyDisplay(f)}
                {f.description ? <Typography component="span" variant="body2" color="text.secondary"> · {f.description}</Typography> : null}
                {f.id === net.active_frequency_id && net.status === 'active' && (
                  <Chip size="small" color="primary" label="In use" sx={{ ml: 1, height: 18, fontSize: '0.7rem' }} />
                )}
              </Typography>
            ))}
          </Section>
        )}

        {/* ===== People ===== */}
        <Section title="People">
          {net.owner_callsign && (
            <Typography variant="body2">Net manager: {person(net.owner_id ?? null, net.owner_callsign, net.owner_name)}</Typography>
          )}
          {schedule?.owner_callsign && schedule.owner_callsign !== net.owner_callsign && (
            <Typography variant="body2">Schedule manager: {person(schedule.owner_id ?? null, schedule.owner_callsign, schedule.owner_name)}</Typography>
          )}
          {net.ncs_callsign && (
            <Typography variant="body2">NCS: {net.ncs_callsign}</Typography>
          )}
          {activeStaff.length > 0 && (
            <Typography variant="body2" component="div">
              Staff:{' '}
              {activeStaff.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && ', '}
                  {person(s.user_id, s.user_callsign!)}
                </React.Fragment>
              ))}
            </Typography>
          )}
        </Section>

        {/* ===== Blocked stations (net control only) ===== */}
        {canBlock && blocks.length > 0 && (
          <Section title="Blocked from this net">
            {blocks.map((b) => (
              <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {b.callsign}
                  {b.blocked_by_callsign && (
                    <Typography component="span" variant="body2" color="text.secondary"> · by {b.blocked_by_callsign}</Typography>
                  )}
                </Typography>
                <Button size="small" onClick={() => unblock(b)}>Unblock</Button>
              </Box>
            ))}
            {blockError && <Typography variant="caption" color="error">{blockError}</Typography>}
          </Section>
        )}

        {/* ===== Links ===== */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          {net.info_url && (
            <Button size="small" variant="outlined" startIcon={<LanguageIcon />} href={net.info_url} target="_blank" rel="noopener noreferrer">
              Website
            </Button>
          )}
          {templateId && (
            <Button size="small" variant="outlined" component={RouterLink} to={subscribePath(templateId)}>
              Subscribe
            </Button>
          )}
          {isClosed && (
            <Button size="small" variant="outlined" component={RouterLink} to={`/nets/${net.id}/report`}>
              Report
            </Button>
          )}
          {isClosed && (
            <Button size="small" variant="outlined" component={RouterLink} to={`/statistics/nets/${net.id}`}>
              Statistics
            </Button>
          )}
          {canEdit && (
            <Button size="small" variant="contained" startIcon={<EditIcon />} component={RouterLink} to={`/nets/${net.id}/edit`} sx={{ ml: 'auto' }}>
              Edit
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default NetInfoDialog;
