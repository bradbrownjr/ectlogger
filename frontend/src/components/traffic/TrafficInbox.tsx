import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import useTrafficInbox from '../../hooks/useTrafficInbox';
import RelayLogDialog from './RelayLogDialog';

// ========== TrafficInbox ==========
// The caller's pending-held traffic (GET /traffic/inbox), oldest first, each
// row showing age since it landed in the caller's inbox and a "Log handoff"
// button that opens RelayLogDialog. Self-contained (fetches its own data via
// useTrafficInbox, matching TrafficDetail.tsx's self-fetch pattern), used by
// the Traffic page's Inbox tab.
// See docs/concepts/TRAFFIC-HANDLING-DESIGN.md sections 2.5 and 4.3.

function formatAge(isoDate: string | null): string {
  if (!isoDate) return '';
  const withZ = isoDate.endsWith('Z') ? isoDate : `${isoDate}Z`;
  const ms = Date.now() - new Date(withZ).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TrafficInboxProps {
  limit?: number;
  onEmptyText?: string;
}

const TrafficInbox: React.FC<TrafficInboxProps> = ({ limit, onEmptyText }) => {
  const navigate = useNavigate();
  const { items, loading, error, refetch } = useTrafficInbox();
  const [handoffFormId, setHandoffFormId] = useState<number | null>(null);

  const displayed = limit ? items.slice(0, limit) : items;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (displayed.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {onEmptyText || 'Nothing in your traffic inbox right now.'}
      </Typography>
    );
  }

  return (
    <Box>
      {displayed.map((item) => (
        <Paper
          key={item.id}
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            cursor: 'pointer',
          }}
          onClick={() => navigate(`/traffic?id=${item.id}`)}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2">
                {item.form_type}{item.message_number ? ` NR ${item.message_number}` : ''}
              </Typography>
              {item.precedence && <Chip size="small" label={item.precedence} />}
              <Typography variant="caption" color="text.secondary">{formatAge(item.held_since)}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap>
              {item.subject || item.addressee_display || '(no subject)'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SendIcon />}
            onClick={(e) => { e.stopPropagation(); setHandoffFormId(item.id); }}
            sx={{ minHeight: 44 }}
          >
            Log handoff
          </Button>
        </Paper>
      ))}

      {handoffFormId !== null && (
        <RelayLogDialog
          open
          formId={handoffFormId}
          onClose={() => setHandoffFormId(null)}
          onLogged={refetch}
        />
      )}
    </Box>
  );
};

export default TrafficInbox;
