import React, { useState, useEffect } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import { Rnd } from 'react-rnd';
import { checkInApi } from '../services/api';

interface BulkCheckInProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  onCheckInsAdded: () => void;
}

interface ParsedCheckIn {
  callsign: string;
  name?: string;
  location?: string;
  power_source?: string;
  notes?: string;
  status?: string;
  error?: string;
}

// Status shortcuts mapping
const STATUS_SHORTCUTS: Record<string, string> = {
  'jl': 'listening',      // Just Listening
  'r': 'relay',           // Relay
  't': 'available',       // Traffic (has traffic to report)
  'a': 'announcements',   // Announcements
  'o': 'checked_out',     // Out / Checked Out
};

const BulkCheckIn: React.FC<BulkCheckInProps> = ({ open, onClose, netId, onCheckInsAdded }) => {
  const [minimized, setMinimized] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const [showResults, setShowResults] = useState(false);

  // Window position and size state
  const [windowState, setWindowState] = useState({
    x: Math.max(50, window.innerWidth - 650),
    y: 100,
    width: 600,
    height: minimized ? 48 : 400,
  });

  // Update height when minimized state changes
  useEffect(() => {
    setWindowState(prev => ({
      ...prev,
      height: minimized ? 48 : 400,
    }));
  }, [minimized]);

  if (!open) return null;

  const parseCheckIns = (text: string): ParsedCheckIn[] => {
    const checkIns: ParsedCheckIn[] = [];
    
    // Split by semicolon to get individual check-ins
    const entries = text.split(';').map(e => e.trim()).filter(e => e.length > 0);
    
    for (const entry of entries) {
      // Check for status suffix (e.g., ":jl" or ":r")
      let mainPart = entry;
      let status: string | undefined;
      
      const colonIndex = entry.lastIndexOf(':');
      if (colonIndex > 0) {
        const possibleStatus = entry.substring(colonIndex + 1).trim().toLowerCase();
        if (STATUS_SHORTCUTS[possibleStatus]) {
          status = STATUS_SHORTCUTS[possibleStatus];
          mainPart = entry.substring(0, colonIndex).trim();
        }
      }
      
      // Split by comma to get fields
      const fields = mainPart.split(',').map(f => f.trim());
      
      if (fields.length === 0 || !fields[0]) {
        continue; // Skip empty entries
      }
      
      const checkIn: ParsedCheckIn = {
        callsign: fields[0].toUpperCase(),
        status: status || 'checked_in',
      };
      
      // Parse remaining fields - they're positional:
      // callsign, name, location, power_source, notes
      if (fields.length > 1 && fields[1]) checkIn.name = fields[1];
      if (fields.length > 2 && fields[2]) checkIn.location = fields[2];
      if (fields.length > 3 && fields[3]) checkIn.power_source = fields[3];
      if (fields.length > 4 && fields[4]) checkIn.notes = fields[4];
      
      // Validate callsign format (basic check)
      if (!/^[A-Z0-9\/]+$/i.test(checkIn.callsign)) {
        checkIn.error = `Invalid callsign format: ${checkIn.callsign}`;
      }
      
      checkIns.push(checkIn);
    }
    
    return checkIns;
  };

  const handleSubmit = async () => {
    if (!bulkText.trim()) return;
    
    setProcessing(true);
    const parsed = parseCheckIns(bulkText);
    
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const checkIn of parsed) {
      if (checkIn.error) {
        failed++;
        errors.push(checkIn.error);
        continue;
      }
      
      try {
        await checkInApi.create(netId, {
          callsign: checkIn.callsign,
          name: checkIn.name || '',
          location: checkIn.location || '',
          power_source: checkIn.power_source || '',
          notes: checkIn.notes || '',
          status: checkIn.status || 'checked_in',
        });
        success++;
      } catch (error: any) {
        failed++;
        const detail = error.response?.data?.detail || 'Unknown error';
        errors.push(`${checkIn.callsign}: ${detail}`);
      }
    }
    
    setResults({ success, failed, errors });
    setShowResults(true);
    setProcessing(false);
    
    if (success > 0) {
      onCheckInsAdded();
      setBulkText(''); // Clear on success
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Preview parsed check-ins
  const preview = bulkText.trim() ? parseCheckIns(bulkText) : [];

  return (
    <>
      <Rnd
        size={{ width: windowState.width, height: windowState.height }}
        position={{ x: windowState.x, y: windowState.y }}
        onDragStop={(e, d) => {
          setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
        }}
        onResizeStop={(e, direction, ref, delta, position) => {
          setWindowState({
            width: parseInt(ref.style.width),
            height: parseInt(ref.style.height),
            x: position.x,
            y: position.y,
          });
        }}
        minWidth={400}
        minHeight={minimized ? 48 : 300}
        bounds="window"
        dragHandleClassName="drag-handle"
        enableResizing={!minimized}
        style={{ zIndex: 1300 }}
      >
        <Paper
          elevation={8}
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: 1,
            borderColor: 'divider',
          }}
        >
          {/* Title bar - draggable */}
          <Box
            className="drag-handle"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              cursor: 'move',
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle1" fontWeight="bold">
              ⏩ Bulk Check-In
            </Typography>
            <Box>
              <IconButton
                size="small"
                onClick={() => setMinimized(!minimized)}
                sx={{ color: 'inherit', mr: 0.5 }}
              >
                {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
              </IconButton>
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ color: 'inherit' }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Content */}
          {!minimized && (
            <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TextField
                fullWidth
                multiline
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="KC1ABC, John, Portland ME, Generator; N1XYZ, Jane, Boston MA:jl; W1AAA, Bob, Augusta ME,, Has message for NCS:t"
                disabled={processing}
                sx={{ mb: 1 }}
              />
              
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                Format: <strong>callsign, name, location, power source, notes</strong> — separate check-ins with <strong>;</strong>
                <br />
                Add status with <strong>:</strong> at end — <strong>:jl</strong> = Just Listening, <strong>:r</strong> = Relay, <strong>:t</strong> = Traffic, <strong>:a</strong> = Announcements
                <br />
                Missing fields are okay — just leave them empty (e.g., "KC1ABC, John,, Battery" skips location)
              </Typography>

              {/* Preview */}
              {preview.length > 0 && (
                <Box sx={{ flex: 1, overflow: 'auto', mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    Preview ({preview.length} check-in{preview.length !== 1 ? 's' : ''}):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {preview.map((ci, idx) => (
                      <Chip
                        key={idx}
                        size="small"
                        label={`${ci.callsign}${ci.status !== 'checked_in' ? ` (${ci.status})` : ''}`}
                        color={ci.error ? 'error' : 'default'}
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={onClose} disabled={processing}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={!bulkText.trim() || processing}
                  startIcon={processing ? <CircularProgress size={16} /> : null}
                >
                  {processing ? 'Adding...' : `Add ${preview.length} Check-in${preview.length !== 1 ? 's' : ''}`}
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      </Rnd>

      <Snackbar
        open={showResults}
        autoHideDuration={6000}
        onClose={() => setShowResults(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowResults(false)}
          severity={results.failed > 0 ? 'warning' : 'success'}
          sx={{ width: '100%' }}
        >
          {results.success > 0 && `Added ${results.success} check-in${results.success !== 1 ? 's' : ''}.`}
          {results.failed > 0 && ` ${results.failed} failed.`}
          {results.errors.length > 0 && (
            <Box component="span" sx={{ display: 'block', fontSize: '0.85em', mt: 0.5 }}>
              {results.errors.slice(0, 3).join('; ')}
              {results.errors.length > 3 && `... and ${results.errors.length - 3} more`}
            </Box>
          )}
        </Alert>
      </Snackbar>
    </>
  );
};

export default BulkCheckIn;
