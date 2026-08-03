import React, { useCallback, useEffect, useState } from 'react';
import { Box, Paper, Typography, Chip, Divider, CircularProgress, Alert, Grid, Button } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { exportElementToPdf } from '../../utils/pdfExport';
import { TrafficForm } from '../../hooks/useTrafficList';
import { FormDefinition } from '../../hooks/useFormDefinitions';
import TrafficLogTimeline, { TrafficLogEntry } from './TrafficLogTimeline';
import RelayLogDialog from './RelayLogDialog';
import RadiogramPrintView from './print/RadiogramPrintView';
import ICS213PrintView from './print/ICS213PrintView';

// ========== TrafficDetail ==========
// Read view of a single form: field values, disposition, the chain-of-custody
// timeline, and the "Log a handoff" entry point. Self-contained (fetches its
// own data from formId) since nothing outside it reads this state -- see
// DEVELOPMENT.md's frontend component-split pattern.

interface FormDetail extends TrafficForm {
  definition: FormDefinition;
  log_entries: TrafficLogEntry[];
}

interface TrafficDetailProps {
  formId: number;
}

const TrafficDetail: React.FC<TrafficDetailProps> = ({ formId }) => {
  const [form, setForm] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'text' | 'pdf' | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);

  const refetch = useCallback(() => {
    setError(null);
    return trafficApi.get(formId)
      .then((res) => {
        setForm(res.data);
      })
      .catch((err) => {
        setError(getErrorMessage(err, 'Failed to load this traffic item'));
      });
  }, [formId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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

  // Refetch when the WebSocket relays a traffic_log_changed event for this
  // form's net (dispatched as a window CustomEvent by useNetWebSocket.ts),
  // so the timeline stays current if a hop is logged from another tab/client
  // while this detail view is open.
  useEffect(() => {
    const handleTrafficLogChanged = (event: any) => {
      if (event.detail?.form_id === formId) {
        refetch();
      }
    };
    window.addEventListener('trafficLogChanged', handleTrafficLogChanged);
    return () => window.removeEventListener('trafficLogChanged', handleTrafficLogChanged);
  }, [formId, refetch]);

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

  const printViewId = `traffic-print-view-${form.id}`;

  // Text still downloads the server-rendered plaintext file (traffic_export.py),
  // following the same blob-response idiom as NetView.tsx's handleExportCSV. PDF
  // instead captures the off-screen RadiogramPrintView/ICS213PrintView below via
  // the same html2canvas+jsPDF pipeline every other PDF export in the app uses
  // (utils/pdfExport.ts) -- see TRAFFIC-HANDLING-DESIGN.md section 4.5.
  const handleExport = async (exportFormat: 'text' | 'pdf') => {
    setExportingFormat(exportFormat);
    try {
      if (exportFormat === 'pdf') {
        await exportElementToPdf(printViewId, {
          filename: `${form.form_type}_${form.message_number || form.id}`,
        });
        return;
      }
      const response = await trafficApi.exportForm(form.id, 'text');
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${form.form_type}_${form.message_number || form.id}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to export traffic form as ${exportFormat}:`, err);
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h6">
          {form.definition.title}{form.message_number ? ` — NR ${form.message_number}` : ''}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={form.disposition} size="small" />
          <Button
            size="small"
            variant="outlined"
            startIcon={exportingFormat === 'text' ? <CircularProgress size={14} /> : <DescriptionIcon />}
            disabled={exportingFormat !== null}
            onClick={() => handleExport('text')}
            sx={{ minHeight: 44 }}
          >
            Text
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={exportingFormat === 'pdf' ? <CircularProgress size={14} /> : <PictureAsPdfIcon />}
            disabled={exportingFormat !== null}
            onClick={() => handleExport('pdf')}
            sx={{ minHeight: 44 }}
          >
            PDF
          </Button>
        </Box>
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

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">
          Chain of custody ({form.log_entries.length})
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SendIcon />}
          onClick={() => setHandoffOpen(true)}
          sx={{ minHeight: 44 }}
        >
          Log Handoff
        </Button>
      </Box>
      <TrafficLogTimeline entries={form.log_entries} formCreatedById={form.created_by_id} />

      {handoffOpen && (
        <RelayLogDialog
          open
          formId={form.id}
          onClose={() => setHandoffOpen(false)}
          onLogged={refetch}
        />
      )}

      {/* Off-screen form-accurate print view, captured by handleExport('pdf') above.
          Always mounted (not conditional on the export click) so exportElementToPdf
          finds it in the DOM the moment the button is pressed -- positioned off
          canvas rather than display:none since html2canvas needs it laid out. */}
      <Box sx={{ position: 'fixed', top: 0, left: -9999, width: 0, height: 0, overflow: 'hidden' }}>
        {form.form_type === 'RADIOGRAM' ? (
          <RadiogramPrintView id={printViewId} form={form} />
        ) : form.form_type === 'ICS213' ? (
          <ICS213PrintView id={printViewId} form={form} />
        ) : null}
      </Box>
    </Paper>
  );
};

export default TrafficDetail;
