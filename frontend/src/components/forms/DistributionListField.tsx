import React, { useEffect, useState } from 'react';
import { Box, IconButton, Link, Popover, TextField, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import api from '../../services/api';

// ========== DISTRIBUTION LIST FIELD ==========
// One group address (a groups.io list, for example) that gets the reminder
// the day before and the net's log (backend services/distribution_list.py).
// In General Net Features on both the net and the schedule form; a
// schedule's address is copied to each net it creates.
//
// The (i) button explains how a group accepts mail from the app's sending
// address. That address comes from GET /settings (email_from_address), never
// written into the page, since each instance sends from its own. Checked
// against the groups.io owners manual, 2026-11-19: free groups can only
// invite (an unmonitored address can't accept), paid groups can Direct Add.

const DOCS_URL = 'https://ectlogger.us/docs/net-managers/distribution-list/';

interface DistributionListFieldProps {
  scope: 'net' | 'schedule';
  value: string;
  onChange: (value: string) => void;
}

const DistributionListField: React.FC<DistributionListFieldProps> = ({ scope, value, onChange }) => {
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    api.get('/settings')
      .then((r) => setFromAddress(r.data?.email_from_address || null))
      .catch(() => setFromAddress(null));
  }, []);

  const sender = fromAddress || "this site's sending address";
  const caption = scope === 'schedule'
    ? 'A group address, such as a groups.io list. Each net from this schedule sends it the reminder the day before and the log.'
    : 'A group address, such as a groups.io list. It gets the reminder the day before and the log.';

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <TextField
          label="Distribution list"
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="yourgroup@groups.io"
          helperText={caption}
          fullWidth
          inputProps={{ maxLength: 254, autoComplete: 'off' }}
        />
        {/* Opens the note on letting the group accept these emails */}
        <IconButton
          aria-label="How a group accepts these emails"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ mt: 1, minWidth: 44, minHeight: 44 }}
        >
          <InfoOutlinedIcon />
        </IconButton>
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, maxWidth: 380 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Letting the group accept these emails</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The emails come from <strong>{sender}</strong>. Most groups take mail only from their members.
          </Typography>
          <Typography variant="body2" component="div">
            On groups.io:
            <ul style={{ margin: '4px 0 8px', paddingLeft: 20 }}>
              <li>A paid group's owner adds {sender} with Direct Add, then sets its posting to Override: not moderated.</li>
              <li>A free group can't add it. Turn on Allow Nonmembers to Post, and a moderator approves each email.</li>
            </ul>
            On other list services, allow {sender} to post.
          </Typography>
          <Link href={DOCS_URL} target="_blank" rel="noopener" variant="body2" sx={{ display: 'inline-block', mt: 1 }}>
            Learn more
          </Link>
        </Box>
      </Popover>
    </Box>
  );
};

export default DistributionListField;
