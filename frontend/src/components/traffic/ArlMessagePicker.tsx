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
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { trafficApi } from '../../services/api';

// ========== ArlMessagePicker ==========
// Group -> number -> fill blanks -> assemble -> insert. A direct port of the
// reference's fill_arl_or_textarea_field / _fill_arl_blanks flow (bpq-apps
// apps/forms.py), rebuilt as a wizard dialog instead of a terminal prompt
// loop. See docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 4.3.
//
// The catalog (GET /traffic/arl-messages) is static reference data, so it is
// fetched once and cached at module scope -- reopening the dialog never
// re-fetches.

interface ArlMessage {
  num: number;
  word: string;
  group: string;
  text: string;
  blanks: string[];
}

interface ArlMessagePickerProps {
  open: boolean;
  onClose: () => void;
  // Emits the assembled "ARL <word> <blank1> <blank2> ..." text back to the
  // caller, which inserts it into the radiogram's text field.
  onInsert: (text: string) => void;
}

let cachedMessages: ArlMessage[] | null = null;

type Step = 'group' | 'list' | 'blanks';

const GROUP_LABELS: Record<string, string> = {
  emergency: 'Emergency / Welfare',
  routine: 'Routine',
};

const ArlMessagePicker: React.FC<ArlMessagePickerProps> = ({ open, onClose, onInsert }) => {
  const [messages, setMessages] = useState<ArlMessage[]>(cachedMessages ?? []);
  const [loading, setLoading] = useState(!cachedMessages);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('group');
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArlMessage | null>(null);
  const [blankValues, setBlankValues] = useState<string[]>([]);

  // Reset the wizard to the start and (re)fetch the catalog only if it
  // isn't cached yet -- every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setStep('group');
    setGroup(null);
    setSelected(null);
    setBlankValues([]);
    setError(null);

    if (cachedMessages) {
      setMessages(cachedMessages);
      setLoading(false);
      return;
    }
    setLoading(true);
    trafficApi
      .listArlMessages()
      .then((res) => {
        cachedMessages = res.data;
        setMessages(cachedMessages as ArlMessage[]);
      })
      .catch(() => setError('Failed to load ARL messages'))
      .finally(() => setLoading(false));
  }, [open]);

  const groups = Array.from(new Set(messages.map((m) => m.group)));

  const handleSelectGroup = (g: string) => {
    setGroup(g);
    setStep('list');
  };

  const handleSelectMessage = (msg: ArlMessage) => {
    setSelected(msg);
    setBlankValues(new Array(msg.blanks.length).fill(''));
    setStep('blanks');
  };

  const handleBack = () => {
    if (step === 'blanks') {
      setStep('list');
      setSelected(null);
    } else if (step === 'list') {
      setStep('group');
      setGroup(null);
    }
  };

  const assembled = selected
    ? ['ARL', selected.word, ...blankValues.map((v) => v.trim()).filter(Boolean)].join(' ')
    : '';

  const handleInsert = () => {
    if (!selected) return;
    onInsert(assembled);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Insert ARL Numbered Message</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {/* ========== STEP 1: CATEGORY ========== */}
            {step === 'group' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Choose a message category.
                </Typography>
                {groups.map((g) => (
                  <Button
                    key={g}
                    variant="outlined"
                    onClick={() => handleSelectGroup(g)}
                    sx={{ justifyContent: 'flex-start', minHeight: 44 }}
                  >
                    {GROUP_LABELS[g] || g}
                  </Button>
                ))}
              </Box>
            )}

            {/* ========== STEP 2: NUMBER / MESSAGE LIST ========== */}
            {step === 'list' && group && (
              <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {messages
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <ListItemButton key={m.num} onClick={() => handleSelectMessage(m)} sx={{ minHeight: 44 }}>
                      <ListItemText
                        primary={`ARL ${m.num} — ${m.word}`}
                        secondary={m.text}
                        secondaryTypographyProps={{ noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
              </List>
            )}

            {/* ========== STEP 3: FILL BLANKS AND PREVIEW ========== */}
            {step === 'blanks' && selected && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  ARL {selected.num} — {selected.word}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {selected.text}
                </Typography>
                {selected.blanks.map((label, i) => (
                  <TextField
                    key={i}
                    fullWidth
                    label={label}
                    value={blankValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...blankValues];
                      next[i] = e.target.value;
                      setBlankValues(next);
                    }}
                    sx={{ mb: 2 }}
                  />
                ))}
                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" component="div">Message text</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{assembled}</Typography>
                </Box>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {step !== 'group' && (
          <Button onClick={handleBack} startIcon={<ArrowBackIcon />} sx={{ minHeight: 44 }}>
            Back
          </Button>
        )}
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Cancel</Button>
        {step === 'blanks' && (
          <Button variant="contained" onClick={handleInsert} sx={{ minHeight: 44 }}>Insert</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ArlMessagePicker;
