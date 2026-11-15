import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { ClosingEmailPreview, netApi, reportSectionsApi, templateApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import {
  ReportFormFeatures,
  ReportSectionEntry,
  effectiveSectionKeys,
  isSectionAvailable,
  toggleReportSection,
} from '../../utils/reportSections';
import { FeatureSwitch } from './NetFeaturesPanel';

// ========== REPORTS TAB ==========
// The last tab of the net and schedule forms: which sections the closing
// email carries, and which switchable sections the net's report page shows.
// The value is `report_sections`, a list of keys or null; null keeps the
// default sections. The null/legacy rules are in utils/reportSections.ts.

// Loaded once per page load: the catalogue is the same for every form.
let cataloguePromise: Promise<ReportSectionEntry[]> | null = null;
const loadCatalogue = () => {
  if (!cataloguePromise) {
    cataloguePromise = reportSectionsApi.list().then((res) => res.data);
    // A failed load is retried the next time the tab opens
    cataloguePromise.catch(() => { cataloguePromise = null; });
  }
  return cataloguePromise;
};

export interface ReportsPreviewTarget {
  kind: 'net' | 'schedule';
  id: number;
}

interface ReportsPanelProps {
  reportSections: string[] | null;
  setReportSections: (value: string[] | null) => void;
  features: ReportFormFeatures;
  // What Preview renders; null in create mode, before there is an id
  previewTarget: ReportsPreviewTarget | null;
}

const ReportsPanel: React.FC<ReportsPanelProps> = ({ reportSections, setReportSections, features, previewTarget }) => {
  const [catalogue, setCatalogue] = useState<ReportSectionEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCatalogue()
      .then((entries) => { if (alive) setCatalogue(entries); })
      .catch((error) => { if (alive) setLoadError(getErrorMessage(error, "Couldn't load the list of sections.")); });
    return () => { alive = false; };
  }, []);

  const onKeys = catalogue ? effectiveSectionKeys(reportSections, catalogue, features) : new Set<string>();
  const shown = catalogue?.filter((entry) => isSectionAvailable(entry, features)) ?? [];

  return (
    <Box>
      {/* ========== CLOSING EMAIL: WHO GETS IT ========== */}
      {/* Recipients as services/net_closure.py::send_net_log builds them */}
      <Typography variant="h6" gutterBottom>Closing email</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Sent when the net closes to the net manager, the schedule's subscribers, and the net's NCS,
        Logger and Relay. Each gets it only with net close notifications turned on in their profile.
      </Typography>

      {/* ========== SECTIONS ========== */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Sections</Typography>
      <Typography variant="body2" color="text.secondary">
        The net's report page follows these switches too.
      </Typography>

      {/* Always in the email; shown so the list reads as the whole email */}
      <Box sx={{ mt: 1 }}>
        <FormControlLabel control={<Switch checked disabled />} label="Net summary and check-in log" />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
          Always included.
        </Typography>
      </Box>

      {/* Shows while the catalogue loads */}
      {!catalogue && !loadError && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Loading sections...</Typography>
        </Box>
      )}
      {/* Shows when the catalogue could not be loaded */}
      {loadError && <Alert severity="error" sx={{ mt: 2 }}>{loadError}</Alert>}

      {/* One switch per section whose feature is on in this form */}
      {shown.map((entry) => (
        <FeatureSwitch
          key={entry.key}
          label={entry.label}
          caption={entry.help}
          checked={onKeys.has(entry.key)}
          onChange={(on) => setReportSections(toggleReportSection(reportSections, entry.key, on, catalogue!, features))}
        />
      ))}

      {/* Shows once a list is saved or changed: puts the default sections back */}
      {catalogue && reportSections !== null && (
        <Button type="button" onClick={() => setReportSections(null)} sx={{ mt: 2, minHeight: 44 }}>
          Use the default sections
        </Button>
      )}

      {/* ========== PREVIEW ========== */}
      <Box sx={{ mt: 3 }}>
        <Button
          type="button"
          variant="outlined"
          startIcon={<VisibilityIcon />}
          onClick={() => setPreviewOpen(true)}
          disabled={!previewTarget}
          sx={{ minHeight: 44 }}
        >
          Preview
        </Button>
        {/* Create mode: nothing to render until the net or schedule exists */}
        {!previewTarget && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Preview is available after saving.
          </Typography>
        )}
      </Box>

      {previewTarget && (
        <ClosingEmailPreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          target={previewTarget}
          reportSections={reportSections}
        />
      )}
    </Box>
  );
};

// ========== CLOSING EMAIL PREVIEW DIALOG ==========
// Renders the email the server would send with the switches as they are now
// (saved or not). The HTML goes in a sandboxed frame: no scripts, no
// same-origin access, so nothing in a net's text can act on the page.
// Links open in a new tab: the app refuses to load inside a frame, so a link
// followed in place left the frame showing "refused to connect".
const openLinksInNewTab = (html: string): string =>
  html.replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}<base target="_blank">`);

interface ClosingEmailPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  target: ReportsPreviewTarget;
  reportSections: string[] | null;
}

const ClosingEmailPreviewDialog: React.FC<ClosingEmailPreviewDialogProps> = ({ open, onClose, target, reportSections }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [preview, setPreview] = useState<ClosingEmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetched each time the dialog opens, from the current switches
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPreview(null);
    setError(null);
    const request = target.kind === 'net'
      ? netApi.closingEmailPreview(target.id, reportSections)
      : templateApi.closingEmailPreview(target.id, reportSections);
    request
      .then((res) => { if (alive) setPreview(res.data); })
      .catch((err) => { if (alive) setError(getErrorMessage(err, "Couldn't build the preview.")); });
    return () => { alive = false; };
    // reportSections is read when the dialog opens; it can't change while open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target.kind, target.id]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Closing email preview</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Uses the switches on this tab and the saved settings on the other tabs.
        </Typography>

        {/* Shows while the preview is being built */}
        {!preview && !error && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Building the preview...</Typography>
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        {preview && (
          <>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              <strong>Subject:</strong> {preview.subject}
            </Typography>
            {/* Shows when there's no real log to render: a net with no
                check-ins yet, or a schedule with no closed net */}
            {preview.source === 'example' && (
              <Alert severity="info">
                {target.kind === 'net'
                  ? 'This net has no check-ins yet, so the preview uses example stations.'
                  : 'This schedule has no past net yet, so the preview uses example data.'}
              </Alert>
            )}
            {/* Emails are designed on white, so the frame stays white in dark mode */}
            <Box
              component="iframe"
              title="Closing email preview"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={openLinksInNewTab(preview.html)}
              sx={{
                width: '100%',
                flex: 1,
                minHeight: fullScreen ? 400 : '60vh',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: '#ffffff',
              }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReportsPanel;
