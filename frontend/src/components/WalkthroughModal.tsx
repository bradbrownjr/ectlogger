import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Link,
  Typography,
  MobileStepper,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import RadioIcon from '@mui/icons-material/Radio';
import LoginIcon from '@mui/icons-material/Login';
import PanToolIcon from '@mui/icons-material/PanTool';
import ChatIcon from '@mui/icons-material/Chat';
import MapIcon from '@mui/icons-material/Map';
import EventIcon from '@mui/icons-material/Event';
import MailIcon from '@mui/icons-material/Mail';
import PersonIcon from '@mui/icons-material/Person';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import GroupIcon from '@mui/icons-material/Group';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FastForwardIcon from '@mui/icons-material/FastForward';
import CellTowerIcon from '@mui/icons-material/CellTower';
import CloseIcon from '@mui/icons-material/Close';
import GroupsIcon from '@mui/icons-material/Groups';
import BarChartIcon from '@mui/icons-material/BarChart';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  WALKTHROUGH_STEPS,
  NetCreationLimits,
  WalkthroughIconName,
  WalkthroughPath,
  docsUrl,
  netCreationLimitsText,
} from './walkthroughSteps';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// Maps the icon names used by the step data to Material icons.
const ICONS: Record<WalkthroughIconName, React.ElementType> = {
  nets: RadioIcon,
  checkIn: LoginIcon,
  status: PanToolIcon,
  chat: ChatIcon,
  map: MapIcon,
  schedule: EventIcon,
  traffic: MailIcon,
  profile: PersonIcon,
  help: HelpOutlineIcon,
  create: AddCircleIcon,
  lobby: MeetingRoomIcon,
  roles: GroupIcon,
  desk: DashboardIcon,
  bulk: FastForwardIcon,
  offNet: CellTowerIcon,
  close: CloseIcon,
  staff: GroupsIcon,
  reports: BarChartIcon,
};

const PATH_LABEL: Record<WalkthroughPath, string> = {
  operator: 'Checking into nets',
  'net-control': 'Running a net',
};

interface WalkthroughModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Where to begin. Omitted (Help menu): show the chooser. 'operator': open on the
   * first operator card, used for a brand-new user's first sign-in.
   */
  startPath?: WalkthroughPath;
}

const WalkthroughModal: React.FC<WalkthroughModalProps> = ({ open, onClose, startPath }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  // null = the chooser screen
  const [path, setPath] = useState<WalkthroughPath | null>(startPath ?? null);
  const [step, setStep] = useState(0);
  const { user, isAuthenticated } = useAuth();
  // Admins and accounts given early access can create a net at once, so the
  // Create a net card says nothing about the limits to them.
  const exemptFromCreationLimits = user?.role === 'admin' || !!user?.schedule_age_bypass;
  // null until loaded, and for a guest, who cannot read the settings
  const [creationLimits, setCreationLimits] = useState<NetCreationLimits | null>(null);

  // This instance's net creation limits, for the Create a net card. Only for a
  // signed-in user: GET /settings needs a sign-in, and a 401 would send a guest
  // to the login page.
  useEffect(() => {
    if (!open || !isAuthenticated || exemptFromCreationLimits) return;
    let cancelled = false;
    api.get('/settings')
      .then((r) => {
        if (cancelled) return;
        setCreationLimits({
          minAccountAgeDays: r.data.schedule_min_account_age_days ?? 0,
          minNetsCheckedInto: r.data.schedule_min_net_participations ?? 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, isAuthenticated, exemptFromCreationLimits]);

  // Reset to the starting state whenever the dialog opens, so relaunching always
  // starts fresh without snapping back during the close animation.
  useEffect(() => {
    if (open) {
      setPath(startPath ?? null);
      setStep(0);
    }
  }, [open, startPath]);

  const choosePath = (p: WalkthroughPath) => {
    setPath(p);
    setStep(0);
  };

  // ========== CHOOSER SCREEN ==========
  // Shown when opened from the Help menu: pick which set of cards to read.
  if (path === null) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle>ECTLogger Walkthrough</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Which describes you? You can switch to the other at the end.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => choosePath('operator')}
              sx={{ minHeight: 72, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">I check into nets</Typography>
                <Typography variant="body2" color="text.secondary">
                  Find a net, check in, chat and file traffic.
                </Typography>
              </Box>
            </Button>
            <Button
              variant="outlined"
              onClick={() => choosePath('net-control')}
              sx={{ minHeight: 72, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', p: 2 }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">I run or manage nets</Typography>
                <Typography variant="body2" color="text.secondary">
                  Create nets, work as net control, close out and report.
                </Typography>
              </Box>
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="inherit" sx={{ minHeight: 44 }}>
            Skip
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ========== CARD SCREEN ==========
  const steps = WALKTHROUGH_STEPS[path];
  const current = steps[Math.min(step, steps.length - 1)];
  const Icon = ICONS[current.icon];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const limitsNote = current.showsCreationLimits && !exemptFromCreationLimits
    ? netCreationLimitsText(creationLimits)
    : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0 }}>
        ECTLogger Walkthrough
        <Typography variant="body2" color="text.secondary">
          {PATH_LABEL[path]}: {step + 1} of {steps.length}
        </Typography>
      </DialogTitle>
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
          <Icon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Typography variant="h6" component="h2" textAlign="center" fontWeight="bold">
            {current.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {current.body}
          </Typography>
          {/* Shows on the Create a net card for anyone the instance's limits apply to */}
          {limitsNote && (
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {limitsNote}
            </Typography>
          )}
          <Link
            href={docsUrl(current.learnMore)}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44 }}
          >
            Learn more <OpenInNewIcon sx={{ fontSize: 16 }} />
          </Link>
        </Box>
        <MobileStepper
          variant="dots"
          steps={steps.length}
          position="static"
          activeStep={step}
          sx={{ bgcolor: 'transparent', justifyContent: 'center', pt: 0 }}
          nextButton={<Box />}
          backButton={<Box />}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} color="inherit" sx={{ minHeight: 44 }}>
          Skip
        </Button>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Back to the chooser only when the first card of a path was reached from it */}
          {isFirst && !startPath ? (
            <Button onClick={() => setPath(null)} sx={{ minHeight: 44 }}>
              Back to choices
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s - 1)} disabled={isFirst} sx={{ minHeight: 44 }}>
              Back
            </Button>
          )}
          {!isLast ? (
            <Button variant="contained" onClick={() => setStep((s) => s + 1)} sx={{ minHeight: 44 }}>
              Next
            </Button>
          ) : path === 'operator' ? (
            // Last operator card: offer the net control cards, or finish
            <>
              <Button onClick={onClose} sx={{ minHeight: 44 }}>
                Done
              </Button>
              <Button variant="contained" onClick={() => choosePath('net-control')} sx={{ minHeight: 44 }}>
                Next: running a net
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={onClose} sx={{ minHeight: 44 }}>
              Done
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default WalkthroughModal;
