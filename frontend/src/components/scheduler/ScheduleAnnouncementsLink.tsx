import React, { useState } from 'react';
import { Box, Link } from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import ScheduleAnnouncementsDialog from './ScheduleAnnouncementsDialog';

interface ScheduleAnnouncementsLinkProps {
  scheduleName: string;
  announcements?: string | null;
  logoUrl?: string | null;
  logoAccentColors?: string[] | null;
}

// ========== SCHEDULE ANNOUNCEMENTS LINK ==========
// The "Announcements" line in a schedule or net card's info list, plus the
// dialog it opens. Renders nothing when the schedule has no announcements.
// A labelled line rather than a card button: the standard button row is
// already full on typical card widths, and this keeps it on one line.
// Shared by ScheduleCard and NetCard so the two stay identical.

const ScheduleAnnouncementsLink: React.FC<ScheduleAnnouncementsLinkProps> = ({
  scheduleName,
  announcements,
  logoUrl,
  logoAccentColors,
}) => {
  const [open, setOpen] = useState(false);
  if (!announcements?.trim()) return null;

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CampaignIcon fontSize="small" color="action" />
        <Link component="button" variant="body2" onClick={() => setOpen(true)}>
          Announcements
        </Link>
      </Box>
      <ScheduleAnnouncementsDialog
        open={open}
        onClose={() => setOpen(false)}
        scheduleName={scheduleName}
        announcements={announcements}
        logoUrl={logoUrl}
        logoAccentColors={logoAccentColors}
      />
    </>
  );
};

export default ScheduleAnnouncementsLink;
