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
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import { Rnd } from 'react-rnd';
import { checkInApi } from '../services/api';

interface FieldConfig {
  [key: string]: {
    enabled: boolean;
    required: boolean;
  };
}

interface BulkCheckInProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  onCheckInsAdded: () => void;
  fieldConfig?: FieldConfig;
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
  't': 'has_traffic',     // Traffic (has traffic to report)
  'a': 'announcements',   // Announcements
  'm': 'mobile',          // Mobile (may only be available briefly)
  'o': 'checked_out',     // Out / Checked Out
};

const BulkCheckIn: React.FC<BulkCheckInProps> = ({ open, onClose, netId, onCheckInsAdded, fieldConfig }) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [minimized, setMinimized] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const [showResults, setShowResults] = useState(false);

  // Build dynamic field list based on enabled fields
  const enabledFields = [
    'callsign', // Always required
    ...(fieldConfig?.name?.enabled !== false ? ['name'] : []),
    ...(fieldConfig?.location?.enabled !== false ? ['location'] : []),
    ...(fieldConfig?.power_source?.enabled ? ['power'] : []),
    ...(fieldConfig?.notes?.enabled !== false ? ['notes'] : []),
  ];

  // Generate format string
  const formatString = enabledFields.join(', ');

  // Generate placeholder example based on enabled fields
  const generatePlaceholder = () => {
    const examples: string[] = [];
    
    // First example - basic check-in
    const ex1Parts = ['KC1ABC'];
    if (fieldConfig?.name?.enabled !== false) ex1Parts.push('John');
    if (fieldConfig?.location?.enabled !== false) ex1Parts.push('Portland ME');
    if (fieldConfig?.power_source?.enabled) ex1Parts.push('Generator');
    examples.push(ex1Parts.join(', '));
    
    // Second example - with status
    const ex2Parts = ['N1XYZ'];
    if (fieldConfig?.name?.enabled !== false) ex2Parts.push('Jane');
    if (fieldConfig?.location?.enabled !== false) ex2Parts.push('Boston MA');
    examples.push(ex2Parts.join(', ') + ':jl');
    
    return examples.join('; ');
  };

  // Window position and size state
  const [windowState, setWindowState] = useState({
    x: Math.max(50, window.innerWidth - 720),
    y: 100,
    width: 680,
    height: minimized ? 48 : 340,
  });

  // Update height when minimized state changes
  useEffect(() => {
    setWindowState(prev => ({
      ...prev,
      height: minimized ? 48 : 340,
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
      
      // Parse remaining fields dynamically based on enabledFields
      // enabledFields includes 'callsign' at index 0, so we start from index 1
      for (let i = 1; i < enabledFields.length && i < fields.length; i++) {
        const fieldName = enabledFields[i];
        const value = fields[i];
        if (value) {
          if (fieldName === 'name') checkIn.name = value;
          else if (fieldName === 'location') checkIn.location = value;
          else if (fieldName === 'power') checkIn.power_source = value;
          else if (fieldName === 'notes') checkIn.notes = value;
        }
      }
      
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
    // Ctrl+Enter to submit
    if (e.key === 'Enter' && e.ctrlKey) {
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
        minWidth={500}
        minHeight={minimized ? 48 : 280}
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
              bgcolor: isDarkMode ? '#1565c0' : 'primary.main',
              color: '#ffffff',
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
                rows={3}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={generatePlaceholder()}
                disabled={processing}
                sx={{ mb: 1 }}
              />
              
              <Box sx={{ mb: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" component="div" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Format: {formatString}
                </Typography>
                <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 0.5 }}>
                  Separate multiple check-ins with semicolon <strong>;</strong>
                </Typography>
                <Typography variant="caption" component="div" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  <span><strong>:jl</strong> Listening</span>
                  <span><strong>:r</strong> Relay</span>
                  <span><strong>:t</strong> Traffic</span>
                  <span><strong>:a</strong> Announce</span>
                  <span><strong>:m</strong> Mobile</span>
                  <span><strong>:o</strong> Check Out</span>
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {preview.length > 0 && `${preview.length} check-in${preview.length !== 1 ? 's' : ''} • `}Ctrl+Enter to submit
                </Typography>
                <Button onClick={onClose} disabled={processing}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={!bulkText.trim() || processing}
                  startIcon={processing ? <CircularProgress size={16} /> : null}
                >
                  {processing ? 'Adding...' : `Add${preview.length > 0 ? ` ${preview.length}` : ''}`}
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
