import React, { useState, useEffect } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Rnd } from 'react-rnd';

interface SearchCheckInsProps {
  open: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchCount: number;
}

const SearchCheckIns: React.FC<SearchCheckInsProps> = ({ 
  open, 
  onClose, 
  searchQuery, 
  onSearchChange,
  matchCount 
}) => {
  const [minimized, setMinimized] = useState(false);

  // Window position and size state
  const [windowState, setWindowState] = useState({
    x: Math.max(50, window.innerWidth - 450),
    y: 60,
    width: 400,
    height: minimized ? 48 : 140,
  });

  // Update height when minimized state changes
  useEffect(() => {
    setWindowState(prev => ({
      ...prev,
      height: minimized ? 48 : 140,
    }));
  }, [minimized]);

  if (!open) return null;

  return (
    <Rnd
      size={{ width: windowState.width, height: windowState.height }}
      position={{ x: windowState.x, y: windowState.y }}
      onDragStop={(_e, d) => {
        setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        setWindowState({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          x: position.x,
          y: position.y,
        });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 120}
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
            🔍 Search
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
              onClick={() => {
                onSearchChange(''); // Clear search when closing
                onClose();
              }}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Content */}
        {!minimized && (
          <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search callsign, name, or location..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onSearchChange('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {searchQuery ? (
                <Chip 
                  size="small" 
                  label={`${matchCount} match${matchCount !== 1 ? 'es' : ''}`}
                  color={matchCount > 0 ? 'success' : 'default'}
                  variant="outlined"
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Filters check-ins, chat, and map
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default SearchCheckIns;
