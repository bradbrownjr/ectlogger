import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  MobileStepper,
} from '@mui/material';
import RadioIcon from '@mui/icons-material/Radio';
import EditNoteIcon from '@mui/icons-material/EditNote';
import EventIcon from '@mui/icons-material/Event';
import BarChartIcon from '@mui/icons-material/BarChart';
import PersonIcon from '@mui/icons-material/Person';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: <RadioIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Dashboard — Your Nets',
    description:
      'The Dashboard lists all active and recent nets. Click any net to join as a ' +
      'participant and view the live check-in list. Use the Create Net button to start ' +
      'a new session as Net Control Station (NCS).',
  },
  {
    icon: <EditNoteIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Running a Net',
    description:
      'Inside a net, the check-in entry form is at the bottom of the check-in panel. ' +
      'Enter a callsign and any configured fields (name, location, weather, etc.) and ' +
      'click Check In. Real-time chat and a map are available as floating panels you ' +
      'can move and resize.',
  },
  {
    icon: <EventIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Schedule',
    description:
      'The Scheduler shows upcoming net sessions for all schedules you manage or ' +
      'are assigned to. Click any session to see the NCS rotation, open a lobby ' +
      'early, or manage the schedule details.',
  },
  {
    icon: <BarChartIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Statistics',
    description:
      'The Statistics page tracks operator check-in history, net frequency, and ' +
      'participation trends. Drill into a specific net or schedule from the list to ' +
      'see historical breakdowns and schedule-level stats.',
  },
  {
    icon: <PersonIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Profile & Settings',
    description:
      'Click your avatar in the top-right corner to access your profile. From there ' +
      'you can update your callsign, location, and grid square, manage notification ' +
      'preferences, and view your personal check-in statistics.',
  },
  {
    icon: <HelpOutlineIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
    title: 'Help Menu',
    description:
      'You can relaunch this walkthrough any time from the Help menu in the top ' +
      'navigation bar. Use Submit Feedback to report bugs or suggest features — ' +
      'your message goes directly to the site administrator.',
  },
];

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
}

const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>ECTLogger Walkthrough</DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            py: 2,
            minHeight: 220,
          }}
        >
          {current.icon}
          <Typography variant="h6" textAlign="center" fontWeight="bold">
            {current.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {current.description}
          </Typography>
        </Box>
        <MobileStepper
          variant="dots"
          steps={STEPS.length}
          position="static"
          activeStep={step}
          sx={{ bgcolor: 'transparent', justifyContent: 'center', pt: 0 }}
          nextButton={<Box />}
          backButton={<Box />}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Button onClick={handleClose} color="inherit">
          Skip
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          {isLast ? (
            <Button variant="contained" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <Button variant="contained" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default WalkthroughModal;
