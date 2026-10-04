import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReportPaper from '../report/ReportPaper';
import ReportMasthead from '../report/ReportMasthead';
import ReportFooter from '../report/ReportFooter';
import { getScreenReportAccent } from '../report/ReportAccent';
import MarkdownRender from '../shared/MarkdownRender';
import { exportElementToPdf } from '../../utils/pdfExport';
import { formatDateTime } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';

interface ScheduleAnnouncementsDialogProps {
  open: boolean;
  onClose: () => void;
  scheduleName: string;
  announcements: string;
  logoUrl?: string | null;
  logoAccentColors?: string[] | null;
}

const CONTENT_ID = 'schedule-announcements-content';

// ========== SCHEDULE ANNOUNCEMENTS DIALOG ==========
// Read-only view of a schedule's announcements, opened from the Scheduler
// page so anyone (guests included) can catch up without joining a net.
// Drawn on the same report parts as the net and schedule reports, so the
// on-screen view and its PDF match them. Editing stays in the net's own
// announcements panel (ScheduleAnnouncements.tsx).

const ScheduleAnnouncementsDialog: React.FC<ScheduleAnnouncementsDialogProps> = ({
  open,
  onClose,
  scheduleName,
  announcements,
  logoUrl,
  logoAccentColors,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const { accent } = getScreenReportAccent(logoAccentColors, theme);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportElementToPdf(CONTENT_ID, {
        filename: `${scheduleName.replace(/[^a-zA-Z0-9]/g, '_')}_Announcements`,
        orientation: 'portrait',
        pageFooter: `${scheduleName} · Announcements`,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        Announcements
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 1, sm: 2 } }}>
        {/* ========== EXPORTABLE CONTENT ========== */}
        {/* Everything inside the ReportPaper is what the PDF captures. */}
        <ReportPaper id={CONTENT_ID} accentColors={logoAccentColors}>
          <ReportMasthead logoUrl={logoUrl} eyebrow="Announcements" title={scheduleName} />
          {/* Headings and links take the report accent; ReportPaper has the
              PDF put the logo's print color back (see DESIGN.md "Reports"). */}
          <MarkdownRender
            content={announcements}
            emptyText="No schedule announcements have been defined."
            variant="colored"
            sx={{
              '& h1, & h2, & h3': { mt: 2, mb: 1, color: accent },
              '& a': { color: accent },
              '& hr': { border: 'none', borderTop: 1, borderColor: 'divider', my: 2 },
            }}
          />
          <ReportFooter generatedAt={formatDateTime(new Date().toISOString(), user?.prefer_utc || false)} />
        </ReportPaper>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<PictureAsPdfIcon />} onClick={handleExportPdf} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export PDF'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleAnnouncementsDialog;
