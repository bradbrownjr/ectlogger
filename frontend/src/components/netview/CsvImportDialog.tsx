import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
  List,
  ListItem,
  ListItemText,
  Alert,
  TextField,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';

// ========== CSV IMPORT DIALOG ==========
// Self-contained modal for importing check-ins from a CSV file. Owns all of its
// own state (file, timezone, in-flight, errors/summary) and handlers; the parent
// only supplies the net identity and callbacks. Extracted verbatim from NetView.

const COMMON_IMPORT_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'Europe/London',
];

// Render a UTC instant as the wall-clock text a datetime-local input expects,
// in an arbitrary IANA zone. Deliberately not the getTimezoneOffset trick used
// in CreateNet.tsx: that converts to the *browser's* zone, which would disagree
// with this dialog's own Import Time Zone selector and silently shift the window.
const formatForInputInZone = (iso: string | null | undefined, timeZone: string): string => {
  if (!iso) return '';
  const parsed = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(parsed);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  // Intl renders midnight as hour 24 in some locales/engines; normalize it.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
};

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  netId: string | undefined;
  netName: string;
  /** Pre-formatted first frequency for the downloadable template's sample row. */
  sampleFrequencyDisplay: string;
  /** Net lifecycle status - decides backfill mode, prefill source, and the close option. */
  netStatus?: string | null;
  scheduledStartTime?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  onToast: (message: string) => void;
  /** Called after a successful import so the parent can refresh check-ins/stats/net. */
  onImported: () => void | Promise<void>;
}

const CsvImportDialog: React.FC<CsvImportDialogProps> = ({
  open,
  onClose,
  netId,
  netName,
  sampleFrequencyDisplay,
  netStatus,
  scheduledStartTime,
  startedAt,
  closedAt,
  onToast,
  onImported,
}) => {
  const [csvImportFile, setCsvImportFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportDragOver, setCsvImportDragOver] = useState(false);
  const [csvImportErrors, setCsvImportErrors] = useState<string[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<string>('');
  const [csvImportErrorsTruncated, setCsvImportErrorsTruncated] = useState(false);
  const [csvImportUseUtc, setCsvImportUseUtc] = useState(true);
  const [csvImportTimezone, setCsvImportTimezone] = useState<string>(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return browserTz;
  });
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);
  const [csvImportWarnings, setCsvImportWarnings] = useState<string[]>([]);
  const [netStartedAtInput, setNetStartedAtInput] = useState('');
  const [netClosedAtInput, setNetClosedAtInput] = useState('');
  const [closeOnImport, setCloseOnImport] = useState(true);
  // Once the operator edits a time, stop re-deriving it from the net underneath them.
  const [timesDirty, setTimesDirty] = useState(false);

  const status = (netStatus || '').toLowerCase();
  // A draft or scheduled net never ran in the app, so importing into one is a
  // backfill: the times are required and the net can be closed in the same step.
  const isBackfill = status === 'draft' || status === 'scheduled';
  const isClosedOrArchived = status === 'closed' || status === 'archived';
  const effectiveZone = csvImportUseUtc ? 'UTC' : csvImportTimezone;

  // Reset to a clean slate each time the dialog opens (matches the original
  // handleOpenImportDialog behavior, which reset state before opening).
  useEffect(() => {
    if (open) {
      setCsvImportFile(null);
      setCsvImportDragOver(false);
      setCsvImportErrors([]);
      setCsvImportSummary('');
      setCsvImportErrorsTruncated(false);
      setCsvImportWarnings([]);
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setCsvImportTimezone(browserTz);
      setCsvImportUseUtc(true);
      setCloseOnImport(true);
      setTimesDirty(false);
    }
  }, [open]);

  // Prefill the net times from whatever the net already knows, expressed in the
  // selected import zone. Re-runs when the zone changes so toggling UTC re-renders
  // 23:00 as 19:00 rather than leaving a value that means something different now.
  // A scheduled net has no end time to offer, and a draft has neither: an empty
  // box is better than a plausible guess on a form that writes an official record.
  useEffect(() => {
    if (!open || timesDirty) return;
    if (isClosedOrArchived) {
      setNetStartedAtInput(formatForInputInZone(startedAt, effectiveZone));
      setNetClosedAtInput(formatForInputInZone(closedAt, effectiveZone));
    } else if (status === 'scheduled') {
      setNetStartedAtInput(formatForInputInZone(scheduledStartTime, effectiveZone));
      setNetClosedAtInput('');
    } else if (status === 'draft') {
      setNetStartedAtInput('');
      setNetClosedAtInput('');
    } else {
      setNetStartedAtInput(formatForInputInZone(startedAt, effectiveZone));
      setNetClosedAtInput('');
    }
  }, [open, timesDirty, effectiveZone, status, isClosedOrArchived, scheduledStartTime, startedAt, closedAt]);

  // A backfill cannot proceed without both times, and an inverted range is always
  // a typo. Compared as raw strings: the fixed YYYY-MM-DDTHH:mm format sorts correctly.
  const timesInvalid =
    (isBackfill && (!netStartedAtInput || !netClosedAtInput)) ||
    (!!netStartedAtInput && !!netClosedAtInput && netClosedAtInput <= netStartedAtInput);

  const handleClose = () => {
    if (csvImporting) return;
    onClose();
    setCsvImportFile(null);
    setCsvImportDragOver(false);
    setCsvImportErrors([]);
    setCsvImportSummary('');
    setCsvImportErrorsTruncated(false);
  };

  const handleImportFileSelected = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onToast('Please select a CSV file.');
      return;
    }
    setCsvImportFile(file);
    setCsvImportErrors([]);
    setCsvImportSummary('');
    setCsvImportErrorsTruncated(false);
  };

  const handleCsvImportSubmit = async () => {
    if (!csvImportFile) {
      onToast('Choose a CSV file first.');
      return;
    }
    if (!netId) {
      onToast('Missing net ID for import.');
      return;
    }

    try {
      setCsvImporting(true);
      const formData = new FormData();
      formData.append('file', csvImportFile);
      formData.append('timezone_name', csvImportTimezone || 'UTC');
      formData.append('assume_utc', csvImportUseUtc ? 'true' : 'false');
      // Sent as raw YYYY-MM-DDTHH:mm wall-clock text, never converted here: the
      // server applies the Import Time Zone above so the window and the CSV rows
      // are interpreted by one rule. Omitted when blank so an ordinary import of
      // a live or closed net sends exactly what it always did.
      if (netStartedAtInput) formData.append('net_started_at', netStartedAtInput);
      if (netClosedAtInput) formData.append('net_closed_at', netClosedAtInput);
      if (isBackfill) formData.append('close_net_on_import', closeOnImport ? 'true' : 'false');
      const response = await api.post(`/nets/${netId}/import/csv`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = response.data || {};
      const imported = Number(data.imported || 0);
      const skipped = Number(data.skipped || 0);
      const errorCount = Number(data.error_count || 0);
      const returnedErrors = Array.isArray(data.errors) ? data.errors : [];
      const errorsTruncated = Boolean(data.errors_truncated);

      let message = `Imported ${imported} check-in${imported === 1 ? '' : 's'}`;
      if (skipped > 0) {
        message += `, skipped ${skipped}`;
      }
      if (errorCount > 0) {
        message += `. ${errorCount} row issue${errorCount === 1 ? '' : 's'} reported in the dialog.`;
      }
      if (data.timezone_used) {
        message += ` Time zone: ${data.timezone_used}${data.assume_utc ? ' (UTC mode)' : ''}.`;
      }
      if (data.closed) {
        message += ' Net closed.';
      }

      setCsvImportSummary(message);
      setCsvImportErrors(returnedErrors);
      setCsvImportErrorsTruncated(errorsTruncated);
      setCsvImportWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      onToast(message);
      await onImported();
      if (errorCount === 0) {
        onClose();
        setCsvImportFile(null);
      }
    } catch (error: any) {
      console.error('Failed to import CSV:', error);
      onToast(getErrorMessage(error, 'Failed to import CSV'));
    } finally {
      setCsvImporting(false);
    }
  };

  const handleExportImportTemplate = () => {
    const headers = [
      'Check-in Time',
      'Callsign',
      'Name',
      'Location',
      'Available Frequencies',
      'Spotter #',
      'Weather Observation',
      'Power Src',
      'Power',
      'Feedback',
      'Notes',
      'Relayed By',
      'Status',
      'Topic Response',
      'Poll Response',
    ];

    const sampleMarker = 'ECTLOGGER_SAMPLE_ROW';
    const sampleRows = [
      // Required-fields hint row — auto-ignored on import via sampleMarker
      [
        'REQUIRED',
        'REQUIRED',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        'optional',
        `${sampleMarker} - REQUIRED FIELDS: Check-in Time, Callsign — all others optional`,
      ],
      [
        '7:32 PM',
        'N0CLL',
        'Jane Smith',
        'Portland, ME',
        sampleFrequencyDisplay,
        'YO248',
        'Clear skies, calm winds',
        'Commercial',
        '50W',
        '',
        `${sampleMarker} - DELETE SAMPLE ROWS BEFORE IMPORT`,
        '',
        'checked_in',
        'Sample topic answer',
        'Sample poll answer',
      ],
      [
        '7:34 PM',
        'N1CLL',
        'John Doe',
        'FN43ab',
        '',
        '',
        '',
        '',
        '',
        '',
        `${sampleMarker} - handwritten`,
        'N0CLL',
        'relay',
        '',
        '',
      ],
    ];

    const escapeCsvCell = (value: string) => {
      const text = (value ?? '').toString();
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [headers, ...sampleRows].map((row) => row.map(escapeCsvCell).join(','));
    const csvText = lines.join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(netName || 'net').replace(/ /g, '_')}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Import Check-ins from CSV</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* Shown only for a draft/scheduled net, where this writes a historical record */}
          {isBackfill && (
            <Alert severity="warning">
              <Typography variant="subtitle2" gutterBottom>Backfilling a net that already ran</Typography>
              <Typography variant="body2">
                This writes historical check-in records. Enter the net&apos;s actual start and end times below,
                in the time zone selected here - they decide which timestamps in your file are accepted, they
                resolve rows that give only a time of day, and they become the net&apos;s official start and end.
                Rows outside that window are rejected. There is no one-click undo: imported check-ins are removed
                one at a time, and the times can be corrected afterwards from Edit net.
              </Typography>
            </Alert>
          )}

          {/* Shown on a closed/archived net, where changing the times edits a filed record */}
          {isClosedOrArchived && (
            <Alert severity="info">
              <Typography variant="body2">
                Changing the start or end time below updates this net&apos;s official record, including its log
                and ICS-309. Leave them as prefilled to import without altering the recorded times.
              </Typography>
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            Use the template to match expected columns. Sample template rows are auto-detected and ignored if left in the file.
            Accepted date/time examples: 6/3/2026 2:24 PM, 3/6/2026 14:24, 2:24 PM, 2:24, 14:24.
            A row giving only a time of day is placed using the net start and end times below.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 230 }} disabled={csvImportUseUtc}>
              <InputLabel id="csv-import-timezone-label">Import Time Zone</InputLabel>
              <Select
                labelId="csv-import-timezone-label"
                label="Import Time Zone"
                value={csvImportTimezone}
                onChange={(event) => setCsvImportTimezone(event.target.value)}
              >
                {Array.from(new Set([...COMMON_IMPORT_TIMEZONES, csvImportTimezone])).map((tz) => (
                  <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Checkbox
                  checked={csvImportUseUtc}
                  onChange={(event) => setCsvImportUseUtc(event.target.checked)}
                />
              }
              label="UTC"
            />
          </Box>

          <Typography variant="caption" color="text.secondary">
            If UTC is checked, untagged timestamps are interpreted as UTC. If unchecked, untagged timestamps use the selected time zone.
            Timestamps with explicit zone markers (Z, UTC, GMT, +HH:MM) always use that explicit zone.
          </Typography>

          {/* ========== ACTUAL NET TIMES ========== */}
          {/* Placed below the time zone controls on purpose: these values are wall */}
          {/* clock in the zone selected above, and re-render when that zone changes. */}
          {/* Mirrors the "Actual Net Times" block in create-net/BasicInfoTab.tsx. */}
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>Actual Net Times</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {isBackfill
                ? `Required. When the net actually ran, in ${effectiveZone}.`
                : `Times in ${effectiveZone}. Adjust only if the recorded times are wrong.`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Actual Start Time"
                type="datetime-local"
                value={netStartedAtInput}
                onChange={(event) => { setTimesDirty(true); setNetStartedAtInput(event.target.value); }}
                InputLabelProps={{ shrink: true }}
                required={isBackfill}
                error={isBackfill && !netStartedAtInput}
                sx={{ flex: '1 1 220px' }}
              />
              <TextField
                label="Actual End Time"
                type="datetime-local"
                value={netClosedAtInput}
                onChange={(event) => { setTimesDirty(true); setNetClosedAtInput(event.target.value); }}
                InputLabelProps={{ shrink: true }}
                required={isBackfill}
                error={
                  (isBackfill && !netClosedAtInput) ||
                  (!!netStartedAtInput && !!netClosedAtInput && netClosedAtInput <= netStartedAtInput)
                }
                helperText={
                  !!netStartedAtInput && !!netClosedAtInput && netClosedAtInput <= netStartedAtInput
                    ? 'End must be after start'
                    : undefined
                }
                sx={{ flex: '1 1 220px' }}
              />
            </Box>

            {/* Only a draft/scheduled net has a lifecycle left to complete */}
            {isBackfill && (
              <Box sx={{ mt: 1.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={closeOnImport}
                      onChange={(event) => setCloseOnImport(event.target.checked)}
                    />
                  }
                  label="Close the net at the end time above"
                />
                <Typography variant="caption" color="text.secondary" display="block">
                  Records the net as closed using the times above, so it counts toward attendance statistics.
                  The net log is emailed as it would be for any closed net. Nothing is posted to chat.
                </Typography>
              </Box>
            )}
          </Box>

          {csvImportSummary && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Typography variant="body2">{csvImportSummary}</Typography>
            </Box>
          )}

          {/* Server-side advisories: a wide window, or a close that was skipped */}
          {csvImportWarnings.map((warningText, index) => (
            <Alert severity="warning" key={`${index}-${warningText}`}>
              <Typography variant="body2">{warningText}</Typography>
            </Alert>
          ))}

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportImportTemplate}
            disabled={csvImporting}
            sx={{ alignSelf: 'flex-start' }}
          >
            Import Template
          </Button>

          <Box
            onClick={() => csvImportInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setCsvImportDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setCsvImportDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setCsvImportDragOver(false);
              const dropped = event.dataTransfer?.files?.[0] || null;
              handleImportFileSelected(dropped);
            }}
            sx={{
              border: '2px dashed',
              borderColor: csvImportDragOver ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: csvImportDragOver ? 'action.hover' : 'background.paper',
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Click to open or drag and drop a CSV file
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {csvImportFile ? `Selected: ${csvImportFile.name}` : 'No file selected'}
            </Typography>
          </Box>

          {csvImportErrors.length > 0 && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 220, overflow: 'auto' }}>
              <List dense disablePadding>
                {csvImportErrors.map((errorText, index) => (
                  <ListItem key={`${index}-${errorText}`} divider={index < csvImportErrors.length - 1}>
                    <ListItemText primary={errorText} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {csvImportErrorsTruncated && (
            <Typography variant="caption" color="text.secondary">
              Showing the first 50 row errors.
            </Typography>
          )}

          <input
            ref={csvImportInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(event) => {
              const selected = event.target.files?.[0] || null;
              handleImportFileSelected(selected);
              event.currentTarget.value = '';
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={csvImporting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCsvImportSubmit}
          disabled={!csvImportFile || csvImporting || timesInvalid}
        >
          {csvImporting ? 'Importing...' : 'Import CSV'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CsvImportDialog;
