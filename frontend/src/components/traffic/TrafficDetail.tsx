import React, { useEffect, useState } from 'react';
import { Box, Paper, Typography, Chip, Divider, CircularProgress, Alert, Grid } from '@mui/material';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { TrafficForm } from '../../hooks/useTrafficList';
import { FormDefinition } from '../../hooks/useFormDefinitions';
import { formatDateTime } from '../../utils/dateUtils';

// ========== TrafficDetail ==========
// Read view of a single form: field values, disposition, and a count/list of
// log entries. Self-contained (fetches its own data from formId) since
// nothing outside it reads this state -- see DEVELOPMENT.md's frontend
// component-split pattern. The full chain-of-custody timeline UI
// (TrafficLogTimeline.tsx) is a later phase; this phase shows entries as a
// simple list.

interface TrafficLogEntrySummary {
  id: number;
  sequence: number;
  action: string;
  method: string | null;
  handed_to: string | null;
  path_name: string | null;
  note: string | null;
  occurred_at: string;
}

interface FormDetail extends TrafficForm {
  definition: FormDefinition;
  log_entries: TrafficLogEntrySummary[];
}

interface TrafficDetailProps {
  formId: number;
}

const TrafficDetail: React.FC<TrafficDetailProps> = ({ formId }) => {
  const [form, setForm] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    trafficApi.get(formId)
      .then((res) => {
        if (!cancelled) setForm(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load this traffic item'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error || !form) {
    return <Alert severity="error">{error || 'Traffic item not found'}</Alert>;
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h6">
          {form.definition.title}{form.message_number ? ` — NR ${form.message_number}` : ''}
        </Typography>
        <Chip label={form.disposition} size="small" />
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {form.definition.fields.map((field) => (
          <Grid item xs={12} sm={field.field_type === 'textarea' ? 12 : 6} key={field.name}>
            <Typography variant="caption" color="text.secondary">{field.label}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {form.field_values[field.name] || '—'}
            </Typography>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Chain of custody ({form.log_entries.length})
      </Typography>
      {form.log_entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No log entries yet.</Typography>
      ) : (
        form.log_entries.map((entry) => (
          <Box key={entry.id} sx={{ display: 'flex', alignItems: 'baseline', gap: 2, py: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>
              {formatDateTime(entry.occurred_at)}
            </Typography>
            <Typography variant="body2">
              {entry.action}
              {entry.handed_to ? ` — to ${entry.handed_to}` : ''}
              {entry.path_name ? ` via ${entry.path_name}` : ''}
              {entry.note ? ` (${entry.note})` : ''}
            </Typography>
          </Box>
        ))
      )}
    </Paper>
  );
};

export default TrafficDetail;
