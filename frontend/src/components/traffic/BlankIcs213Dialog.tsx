import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
} from '@mui/material';
import ICS213PrintView from './print/ICS213PrintView';
import { exportElementToPdf } from '../../utils/pdfExport';

// ========== BLANK ICS-213 PAD ==========
// Prints blank ICS-213s for teams to write on in the field, with the incident
// name filled in and, for a drill, the exercise marking. Uses the same
// ICS213PrintView as a filed form, so the pad matches what the app prints for
// traffic logged later. Opened from the Traffic panel's export menu.

const MAX_COPIES = 50;
const BUNDLE_ID = 'blank-ics213-pad';

interface BlankIcs213DialogProps {
  open: boolean;
  onClose: () => void;
  defaultIncidentName?: string;
  defaultExercise?: boolean;
}

const BlankIcs213Dialog: React.FC<BlankIcs213DialogProps> = ({ open, onClose, defaultIncidentName, defaultExercise }) => {
  const [incidentName, setIncidentName] = useState('');
  const [copies, setCopies] = useState('10');
  const [exercise, setExercise] = useState(false);
  // Set while the off-screen pad is mounted for capture.
  const [printing, setPrinting] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setIncidentName(defaultIncidentName || '');
    setExercise(!!defaultExercise);
  }, [open, defaultIncidentName, defaultExercise]);

  const count = Math.min(MAX_COPIES, Math.max(1, parseInt(copies, 10) || 1));

  // Mounting the pad is a state change, so the capture waits a frame for it
  // to lay out, the same as the Traffic panel's PDF export.
  useEffect(() => {
    if (printing == null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        await exportElementToPdf(BUNDLE_ID, { filename: 'ICS-213_blank' });
      } catch (err) {
        console.error('Failed to build the ICS-213 pad:', err);
      } finally {
        if (!cancelled) {
          setPrinting(null);
          onClose();
        }
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [printing, onClose]);

  const blankForm = {
    filed_at: '',
    test_category: exercise ? 'drill' : null,
    field_values: { incident_name: incidentName.trim() },
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Blank ICS-213 pad</DialogTitle>
      <DialogContent>
        <TextField
          label="Incident name"
          value={incidentName}
          onChange={(e) => setIncidentName(e.target.value)}
          fullWidth
          margin="normal"
          inputProps={{ maxLength: 100 }}
        />
        <TextField
          label="Copies"
          type="number"
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          margin="normal"
          inputProps={{ min: 1, max: MAX_COPIES }}
          helperText={`Up to ${MAX_COPIES}`}
        />
        <FormControlLabel
          sx={{ display: 'flex' }}
          control={<Checkbox checked={exercise} onChange={(e) => setExercise(e.target.checked)} />}
          label="Mark as an exercise"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={printing != null} onClick={() => setPrinting(count)}>
          {printing != null ? 'Building PDF...' : 'Download PDF'}
        </Button>
      </DialogActions>

      {/* Off-screen pad, mounted only while the PDF is being built. Off canvas
          rather than display:none, since html2canvas needs it laid out. */}
      {printing != null && (
        <Box sx={{ position: 'fixed', top: 0, left: -99999, width: 800, overflow: 'hidden' }}>
          <Box id={BUNDLE_ID} sx={{ backgroundColor: '#fff', width: 800 }}>
            {Array.from({ length: printing }, (_, i) => (
              <Box key={i} data-pdf-avoid-break sx={{ mb: 4 }}>
                <ICS213PrintView id={`${BUNDLE_ID}-${i}`} form={blankForm} />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Dialog>
  );
};

export default BlankIcs213Dialog;
