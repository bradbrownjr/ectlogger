import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Link,
  Chip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AppLogo from './AppLogo';
import changelogData from '../changelog.json';
import creditsData from '../credits.json';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ open, onClose }) => {
  const version = changelogData.version;
  const honorableMentions = creditsData.honorable_mentions;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>About ECTLogger</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1 }}>
          <AppLogo size={72} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" fontWeight="bold">ECTLogger</Typography>
            <Typography variant="body2" color="text.secondary">
              Modern Radio Net Logging
            </Typography>
            <Chip label={`v${version}`} size="small" sx={{ mt: 0.5 }} />
          </Box>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            ECTLogger is free, open-source net logging software for amateur radio operators and
            emergency communications teams. It will always remain free.
          </Typography>

          <Divider flexItem />

          <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Link
              href="https://github.com/bradbrownjr/ectlogger"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              underline="hover"
            >
              GitHub Repository
              <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Link>
          </Box>

          {/* ========== HONORABLE MENTIONS ========== */}
          {honorableMentions.length > 0 && (
            <>
              <Divider flexItem />
              <Box sx={{ width: '100%' }}>
                <Typography variant="caption" fontWeight="bold" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                  Honorable Mentions
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Thank you for your invaluable feedback through feature requests and bug reports!
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {honorableMentions.map((person) => (
                    <Typography key={person.callsign} variant="caption" color="text.secondary">
                      {person.callsign} — {person.name}
                    </Typography>
                  ))}
                </Box>
              </Box>
            </>
          )}

          <Divider flexItem />

          <Typography variant="caption" color="text.secondary" textAlign="center">
            Released under the{' '}
            <Link
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              MIT License
            </Link>
            {'. '}
            Color palettes from{' '}
            <Link
              href="https://github.com/Jam3/nice-color-palettes"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              Jam3/nice-color-palettes
            </Link>
            {' '}(MIT, © Experience Monks).
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AboutModal;
