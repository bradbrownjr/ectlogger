import React from 'react';
import {
  Box, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
  ChannelPlanEntry, ICS_FUNCTIONS, IcsFunction, PLAN_ROLES, PlanFrequency, PlanRole, frequencyDetails,
  looksLikeRepeater, moveEntry,
} from '../../utils/channelPlan';

// ========== ICS-205 CHANNEL PLAN EDITOR ==========
// Shown on the Communication Plan tab (CommunicationPlanPanel) when Build an
// ICS-205 is on. One entry per selected frequency, in plan order (the
// ICS-205's Ch #): move it up or down, give it a role (PACE) and an ICS
// function, and an assignment and remarks. The page keeps the plan in step
// with the selection (utils/channelPlan.ts::syncChannelPlan), so this only
// edits entries, never adds or drops them.
//
// Each entry is a grid: one row on a wide screen, a stacked card on a phone.

interface Props {
  plan: ChannelPlanEntry[];
  setPlan: React.Dispatch<React.SetStateAction<ChannelPlanEntry[]>>;
  frequencies: PlanFrequency[];
}

const MOVE_BUTTON_SX = { width: 44, height: 44 };

// "146.940 FM"; the offset, tone and N/W go on a line of their own under it
const frequencyLabel = (f: PlanFrequency): string =>
  [f.frequency || f.network, f.mode, f.talkgroup ? `TG ${f.talkgroup}` : ''].filter(Boolean).join(' ');

const ChannelPlanEditor: React.FC<Props> = ({ plan, setPlan, frequencies }) => {
  const byId = new Map(frequencies.filter((f) => f.id != null).map((f) => [f.id as number, f]));
  const entries = plan.filter((e) => byId.has(e.frequency_id));

  const update = (frequencyId: number, change: Partial<ChannelPlanEntry>) =>
    setPlan((prev) => prev.map((e) => (e.frequency_id === frequencyId ? { ...e, ...change } : e)));

  const move = (frequencyId: number, delta: -1 | 1) =>
    setPlan((prev) => moveEntry(prev, prev.findIndex((e) => e.frequency_id === frequencyId), delta));

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select frequencies above to add them to the plan.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {entries.map((entry, i) => {
        const f = byId.get(entry.frequency_id)!;
        const label = frequencyLabel(f);
        const details = frequencyDetails(f);
        const roleId = `channel-plan-role-${entry.frequency_id}`;
        const functionId = `channel-plan-function-${entry.frequency_id}`;
        return (
          <Paper
            key={entry.frequency_id}
            variant="outlined"
            // Names the channel for the Role and Function selects inside
            role="group"
            aria-label={`Channel ${i + 1}, ${label}`}
            sx={{
              p: 1,
              display: 'grid',
              gap: 1,
              alignItems: 'center',
              // Phone: a stacked card. Wide: one row.
              gridTemplateColumns: {
                xs: '1fr 1fr',
                md: 'minmax(220px, 1.4fr) 140px 160px minmax(120px, 1fr) minmax(120px, 1fr)',
              },
            }}
          >
            {/* ---- Ch #, the channel, and the move buttons ---- */}
            <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ minWidth: 24, textAlign: 'right' }} aria-label={`Channel ${i + 1}`}>
                {i + 1}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{label}</Typography>
                {/* Shows when the frequency has an offset, tone or N/W, kept on one line */}
                {details && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ whiteSpace: 'nowrap' }}>
                    {details}
                  </Typography>
                )}
                {f.description && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: 'anywhere' }}>
                    {f.description}
                  </Typography>
                )}
                {/* Shows for an analog channel that looks like a repeater but has no offset or tone */}
                {looksLikeRepeater(f) && (
                  <Typography variant="caption" color="warning.main" display="block">
                    No offset or tone. If this is a repeater, add them with the pencil in the frequency list.
                  </Typography>
                )}
              </Box>
              <Tooltip title="Move up">
                <span>
                  <IconButton sx={MOVE_BUTTON_SX} disabled={i === 0} onClick={() => move(entry.frequency_id, -1)}
                    aria-label={`Move ${label} up`}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move down">
                <span>
                  <IconButton sx={MOVE_BUTTON_SX} disabled={i === entries.length - 1} onClick={() => move(entry.frequency_id, 1)}
                    aria-label={`Move ${label} down`}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {/* ---- Role (PACE) ---- */}
            <FormControl size="small" fullWidth>
              <InputLabel id={`${roleId}-label`}>Role</InputLabel>
              <Select
                labelId={`${roleId}-label`}
                id={roleId}
                label="Role"
                value={entry.plan_role ?? ''}
                onChange={(e) => update(entry.frequency_id, { plan_role: (e.target.value || null) as PlanRole | null })}
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {PLAN_ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
              </Select>
            </FormControl>

            {/* ---- ICS function ---- */}
            <FormControl size="small" fullWidth>
              <InputLabel id={`${functionId}-label`}>Function</InputLabel>
              <Select
                labelId={`${functionId}-label`}
                id={functionId}
                label="Function"
                value={entry.ics_function ?? ''}
                onChange={(e) => update(entry.frequency_id, { ics_function: (e.target.value || null) as IcsFunction | null })}
              >
                {ICS_FUNCTIONS.map((fn) => <MenuItem key={fn.value} value={fn.value}>{fn.label}</MenuItem>)}
              </Select>
            </FormControl>

            {/* ---- Assignment and remarks ---- */}
            <TextField
              size="small"
              label="Assignment"
              placeholder="Net control"
              value={entry.assignment ?? ''}
              onChange={(e) => update(entry.frequency_id, { assignment: e.target.value })}
              inputProps={{ maxLength: 100 }}
              sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
            />
            <TextField
              size="small"
              label="Remarks"
              value={entry.remarks ?? ''}
              onChange={(e) => update(entry.frequency_id, { remarks: e.target.value })}
              inputProps={{ maxLength: 255 }}
              sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
            />
          </Paper>
        );
      })}
    </Box>
  );
};

export default ChannelPlanEditor;
