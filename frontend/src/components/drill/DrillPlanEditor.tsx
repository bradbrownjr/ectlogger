import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { CoverageSite } from '../../utils/coverageSites';
import {
  DrillEvent, DrillMessage, DrillObjective, DrillPlan, OBJECTIVE_RATING_LABELS, ObjectiveRating, newMessage,
} from '../../utils/drillPlan';

// ========== DRILL PLAN EDITOR ==========
// Edits a whole plan as one draft, saved with one PUT
// (routers/drill_plans.py::save_drill_plan). Rows keep their ids so a sent
// message stays tied to its form; a sent row's prepared message is shown
// read-only, since what was sent is filed traffic now.

const EVENT_TYPES = ['Control', 'Message', 'Inject', 'Admin'];

interface DrillPlanEditorProps {
  draft: DrillPlan;
  setDraft: React.Dispatch<React.SetStateAction<DrillPlan>>;
  sites: CoverageSite[];
}

// Move one item of a list up or down.
function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const RowButtons: React.FC<{ index: number; count: number; onMove: (delta: number) => void; onRemove: () => void; label: string }> = ({
  index, count, onMove, onRemove, label,
}) => (
  <Box sx={{ display: 'flex', gap: 0.5 }}>
    <IconButton aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
      <ArrowUpwardIcon fontSize="small" />
    </IconButton>
    <IconButton aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
      <ArrowDownwardIcon fontSize="small" />
    </IconButton>
    <IconButton aria-label={`Remove this ${label}`} onClick={onRemove}>
      <DeleteOutlineIcon fontSize="small" />
    </IconButton>
  </Box>
);

const DrillPlanEditor: React.FC<DrillPlanEditorProps> = ({ draft, setDraft, sites }) => {
  const placeSites = sites.filter((s) => s.site_type !== 'infrastructure');
  const headings = Array.from(new Set(draft.objectives.map((o) => (o.heading || '').trim()).filter(Boolean)));

  const setField = (field: keyof DrillPlan, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const setObjective = (i: number, patch: Partial<DrillObjective>) =>
    setDraft((d) => ({ ...d, objectives: d.objectives.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const setEvent = (i: number, patch: Partial<DrillEvent>) =>
    setDraft((d) => ({ ...d, events: d.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const setMessage = (i: number, patch: Partial<DrillMessage>) =>
    setDraft((d) => ({
      ...d,
      events: d.events.map((e, j) => (j === i ? { ...e, message: { ...(e.message || newMessage()), ...patch } } : e)),
    }));

  const text = (field: keyof DrillPlan, label: string, opts: { multiline?: boolean; placeholder?: string; max?: number } = {}) => (
    <TextField
      label={label}
      value={(draft[field] as string) || ''}
      onChange={(e) => setField(field, e.target.value)}
      fullWidth
      margin="dense"
      multiline={opts.multiline}
      minRows={opts.multiline ? 3 : undefined}
      placeholder={opts.placeholder}
      inputProps={{ maxLength: opts.max ?? 200 }}
    />
  );

  return (
    <Box>
      {/* ========== OVERVIEW ========== */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Overview</Typography>
        {text('exercise_name', 'Exercise name', { placeholder: '2026 Cumberland County SET' })}
        <Typography variant="caption" color="text.secondary">Also the incident name on every ICS-213 for this drill.</Typography>
        {text('exercise_when', 'Date and time', { placeholder: 'Saturday, October 24, 2026, 0800 to 1200' })}
        {text('location', 'Location', { placeholder: 'Cumberland County shelters, EOC and NWS Gray' })}
        {text('purpose', 'Purpose', { multiline: true, max: 8000 })}
        {text('scenario', 'Scenario', { multiline: true, max: 8000 })}
        {text('announcement', 'Exercise announcement', { multiline: true, max: 2000 })}
      </Paper>

      {/* ========== OBJECTIVES ========== */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Objectives</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Group objectives under a heading, such as your county, and they're numbered within it. Rate each one at the hot wash.
        </Typography>
        {draft.objectives.map((o, i) => (
          <Box key={o.id ?? `new-${i}`} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', pt: i ? 1.5 : 0, mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <Autocomplete
                freeSolo
                options={headings}
                value={o.heading || ''}
                onInputChange={(_, v) => setObjective(i, { heading: v })}
                sx={{ flex: { xs: '1 1 100%', sm: '0 0 34%' } }}
                renderInput={(params) => <TextField {...params} label="Heading" size="small" inputProps={{ ...params.inputProps, maxLength: 200 }} />}
              />
              <TextField
                label="Objective"
                size="small"
                value={o.text}
                onChange={(e) => setObjective(i, { text: e.target.value })}
                fullWidth
                multiline
                inputProps={{ maxLength: 2000 }}
              />
              <RowButtons
                index={i} count={draft.objectives.length} label="objective"
                onMove={(delta) => setDraft((d) => ({ ...d, objectives: move(d.objectives, i, delta) }))}
                onRemove={() => setDraft((d) => ({ ...d, objectives: d.objectives.filter((_, j) => j !== i) }))}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
                <InputLabel id={`rating-${i}`}>Result</InputLabel>
                <Select
                  labelId={`rating-${i}`}
                  label="Result"
                  value={o.rating || ''}
                  onChange={(e) => setObjective(i, { rating: (e.target.value || null) as ObjectiveRating | null })}
                >
                  <MenuItem value=""><em>Not rated yet</em></MenuItem>
                  {(Object.keys(OBJECTIVE_RATING_LABELS) as ObjectiveRating[]).map((r) => (
                    <MenuItem key={r} value={r}>{OBJECTIVE_RATING_LABELS[r]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Result notes"
                size="small"
                value={o.result_note || ''}
                onChange={(e) => setObjective(i, { result_note: e.target.value })}
                fullWidth
                inputProps={{ maxLength: 4000 }}
              />
            </Box>
          </Box>
        ))}
        <Button
          startIcon={<AddIcon />}
          onClick={() => setDraft((d) => ({
            ...d,
            objectives: [...d.objectives, { heading: d.objectives[d.objectives.length - 1]?.heading || '', text: '' }],
          }))}
        >
          Add objective
        </Button>
      </Paper>

      {/* ========== SCHEDULE OF EVENTS ========== */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Schedule of events</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Give a row a site to put it in that site's packet; leave it on every site for rows that apply to all.
          A row with a prepared ICS-213 is sent by its site.
        </Typography>
        {draft.events.map((e, i) => {
          const sent = !!e.form_id;
          return (
            <Box key={e.id ?? `new-${i}`} data-drill-event={i} sx={{ borderTop: i ? 1 : 0, borderColor: 'divider', pt: i ? 1.5 : 0, mb: 1.5 }}>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', sm: '110px 1fr 1fr 130px auto' }, alignItems: 'start' }}>
                <TextField label="Time" size="small" value={e.time_label || ''} placeholder="09:15"
                  onChange={(ev) => setEvent(i, { time_label: ev.target.value })} inputProps={{ maxLength: 40 }} />
                <TextField label="Initiator" size="small" value={e.initiator || ''}
                  onChange={(ev) => setEvent(i, { initiator: ev.target.value })} inputProps={{ maxLength: 120 }} />
                <TextField label="Receiver" size="small" value={e.receiver || ''}
                  onChange={(ev) => setEvent(i, { receiver: ev.target.value })} inputProps={{ maxLength: 120 }} />
                <Autocomplete
                  freeSolo
                  options={EVENT_TYPES}
                  value={e.event_type || ''}
                  onInputChange={(_, v) => setEvent(i, { event_type: v })}
                  renderInput={(params) => <TextField {...params} label="Type" size="small" inputProps={{ ...params.inputProps, maxLength: 40 }} />}
                />
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, justifySelf: { xs: 'end', sm: 'auto' } }}>
                  <RowButtons
                    index={i} count={draft.events.length} label="row"
                    onMove={(delta) => setDraft((d) => ({ ...d, events: move(d.events, i, delta) }))}
                    onRemove={() => setDraft((d) => ({ ...d, events: d.events.filter((_, j) => j !== i) }))}
                  />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gap: 1, mt: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField label="Method" size="small" value={e.method || ''} placeholder="2m simplex, HF Winlink"
                  onChange={(ev) => setEvent(i, { method: ev.target.value })} inputProps={{ maxLength: 80 }} />
                <FormControl size="small">
                  <InputLabel id={`site-${i}`}>Site</InputLabel>
                  <Select labelId={`site-${i}`} label="Site" value={e.site_id ?? ''}
                    onChange={(ev) => setEvent(i, { site_id: ev.target.value === '' ? null : Number(ev.target.value) })}>
                    <MenuItem value=""><em>Every site</em></MenuItem>
                    {placeSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField label="Event" size="small" multiline value={e.description || ''}
                  onChange={(ev) => setEvent(i, { description: ev.target.value })} inputProps={{ maxLength: 4000 }} />
                <TextField label="Expected actions" size="small" multiline value={e.expected_actions || ''}
                  onChange={(ev) => setEvent(i, { expected_actions: ev.target.value })} inputProps={{ maxLength: 4000 }} />
              </Box>

              <FormControlLabel
                sx={{ mt: 0.5, mb: 1.5 }}
                control={
                  <Switch
                    checked={!!e.message}
                    disabled={sent}
                    onChange={(ev) => setEvent(i, { message: ev.target.checked ? newMessage() : null })}
                  />
                }
                label={sent ? 'Prepared ICS-213 (sent, so it can no longer be changed)' : 'Prepared ICS-213'}
              />
              {e.message && (
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pl: { sm: 2 } }}>
                  {([
                    ['to_name', 'To (name)', 100], ['to_position', 'To (position)', 100],
                    ['from_name', 'From (name)', 100], ['from_position', 'From (position)', 100],
                  ] as const).map(([field, label, max]) => (
                    <TextField key={field} label={label} size="small" disabled={sent}
                      value={(e.message?.[field] as string) || ''}
                      onChange={(ev) => setMessage(i, { [field]: ev.target.value })} inputProps={{ maxLength: max }} />
                  ))}
                  <TextField label="Subject" size="small" disabled={sent} sx={{ gridColumn: { sm: '1 / -1' } }}
                    value={e.message.subject || ''} onChange={(ev) => setMessage(i, { subject: ev.target.value })}
                    inputProps={{ maxLength: 200 }} />
                  <TextField label="Message" size="small" multiline minRows={3} disabled={sent} sx={{ gridColumn: { sm: '1 / -1' } }}
                    value={e.message.message || ''} onChange={(ev) => setMessage(i, { message: ev.target.value })}
                    helperText='"THIS IS AN EXERCISE" is added at the start and end when it is sent.'
                    inputProps={{ maxLength: 5000 }} />
                  <FormControl size="small" disabled={sent}>
                    <InputLabel id={`priority-${i}`}>Priority</InputLabel>
                    <Select labelId={`priority-${i}`} label="Priority" value={e.message.priority || 'Routine'}
                      onChange={(ev) => setMessage(i, { priority: ev.target.value as DrillMessage['priority'] })}>
                      {['Routine', 'Urgent', 'Emergency'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" disabled={sent}>
                    <InputLabel id={`reply-${i}`}>Reply requested</InputLabel>
                    <Select labelId={`reply-${i}`} label="Reply requested" value={e.message.reply_requested || 'No'}
                      onChange={(ev) => setMessage(i, { reply_requested: ev.target.value as DrillMessage['reply_requested'] })}>
                      <MenuItem value="No">No</MenuItem>
                      <MenuItem value="Yes">Yes</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>
          );
        })}
        <Button startIcon={<AddIcon />} onClick={() => setDraft((d) => ({ ...d, events: [...d.events, {}] }))}>
          Add row
        </Button>
      </Paper>
    </Box>
  );
};

export default DrillPlanEditor;
