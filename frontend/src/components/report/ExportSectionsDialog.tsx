import React, { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { ReportPageSection, ReportPageSectionId } from '../../utils/reportSections';

// ========== EXPORT: CHOOSE SECTIONS ==========
// The step between a report's Export PDF / Export PNG button and the file.
// The choice applies to that one export: it is never saved, and the report
// page shows what it showed before once the export finishes.

interface ExportSectionsDialogProps {
  open: boolean;
  format: 'pdf' | 'png';
  // The sections this net's report has, in page order
  sections: ReportPageSection[];
  // Ticked when the dialog opens: what the page shows
  initial: ReportPageSectionId[];
  onCancel: () => void;
  onExport: (picked: ReportPageSectionId[]) => void;
}

const ExportSectionsDialog: React.FC<ExportSectionsDialogProps> = ({ open, format, sections, initial, onCancel, onExport }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [picked, setPicked] = useState<Set<ReportPageSectionId>>(new Set(initial));

  // Preset again from the page each time it opens
  useEffect(() => {
    if (open) setPicked(new Set(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: ReportPageSectionId, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Choose sections</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {format === 'png'
            ? 'Sections for the images. This export only; the report page stays as it is.'
            : 'Sections for the PDF. This export only; the report page stays as it is.'}
        </Typography>
        <FormGroup>
          {sections.map((section) => (
            <FormControlLabel
              key={section.id}
              sx={{ minHeight: 44 }}
              control={
                <Checkbox
                  checked={section.required || picked.has(section.id)}
                  disabled={section.required}
                  onChange={(e) => toggle(section.id, e.target.checked)}
                />
              }
              label={section.label}
            />
          ))}
        </FormGroup>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" color="inherit" onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={() => onExport(sections.filter((s) => s.required || picked.has(s.id)).map((s) => s.id))}
          sx={{ minHeight: 44 }}
        >
          {format === 'png' ? 'Export PNG' : 'Export PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportSectionsDialog;
