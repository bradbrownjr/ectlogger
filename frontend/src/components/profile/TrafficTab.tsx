import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import MailIcon from '@mui/icons-material/Mail';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import useTrafficInbox from '../../hooks/useTrafficInbox';
import TrafficInbox from '../traffic/TrafficInbox';

// ========== TRAFFIC TAB ("My Traffic") ==========
// Profile's Traffic surface, per docs/concepts/TRAFFIC-HANDLING-DESIGN.md
// section 4.5: inbox count, a short list, and a deep-link to the canonical
// /traffic section. No browse/search UI here -- that stays in Traffic.tsx.
// Fully self-contained per ActivityTab.tsx/CoverageTab.tsx's shape - owns
// its own data fetch via useTrafficInbox(), no shared-form props.

const SHORT_LIST_LIMIT = 5;

const TrafficTab: React.FC = () => {
  const navigate = useNavigate();
  const { count } = useTrafficInbox();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <MailIcon color="primary" />
        <Typography variant="h6">My Traffic</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {count > 0
          ? `You have ${count} piece${count === 1 ? '' : 's'} of traffic pending in your inbox.`
          : 'Nothing in your traffic inbox right now.'}
      </Typography>

      <TrafficInbox limit={SHORT_LIST_LIMIT} onEmptyText="Nothing in your traffic inbox right now." />

      <Button
        variant="outlined"
        endIcon={<ArrowForwardIcon />}
        onClick={() => navigate('/traffic?held_by_me=1')}
        sx={{ mt: 2, minHeight: 44 }}
      >
        View all my traffic
      </Button>
    </Box>
  );
};

export default TrafficTab;
