import React from 'react';
import { Box, Typography, Chip, List, ListItem, ListItemText } from '@mui/material';

interface TemplateSubscriber {
  id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
  user_callsign: string | null;
  subscribed_at: string;
}

interface NCSStaffSubscribersTabProps {
  hasTemplateContext: boolean;
  canViewSubscribers: boolean;
  subscribers: TemplateSubscriber[];
}

// ========== SUBSCRIBERS TAB ==========
// Read-only list of the schedule's template subscribers. No handlers, no
// local state — extracted verbatim from NCSStaffModal's renderSubscribersTab.

const NCSStaffSubscribersTab: React.FC<NCSStaffSubscribersTabProps> = ({
  hasTemplateContext,
  canViewSubscribers,
  subscribers,
}) => {
  if (!hasTemplateContext) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        This net is not linked to a schedule, so it has no subscriber list.
      </Typography>
    );
  }

  if (!canViewSubscribers) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        Subscriber details are visible to admins, schedule managers, and co-managers.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">Subscribers</Typography>
        <Chip label={`${subscribers.length} subscribed`} size="small" variant="outlined" />
      </Box>
      {subscribers.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No subscribers yet.
        </Typography>
      ) : (
        <List dense>
          {subscribers.map((subscriber) => (
            <ListItem
              key={subscriber.id}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography fontWeight="bold">{subscriber.user_callsign || 'Unknown callsign'}</Typography>
                    {subscriber.user_name && <Typography color="text.secondary">({subscriber.user_name})</Typography>}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default NCSStaffSubscribersTab;
