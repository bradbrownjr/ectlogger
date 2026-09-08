import React from 'react';
import { Box, Dialog, DialogContent, IconButton } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';

// ========== SHARED IMAGE LIGHTBOX ==========
// Full-size view for a small inline image (chat uploads, net/club logos).
// Extracted from Chat.tsx's original inline chat-image lightbox so every
// call site shares one implementation instead of copy-pasting the dialog.

interface ImageLightboxProps {
  imageUrl: string | null;
  alt: string;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, alt, onClose }) => {
  return (
    <Dialog open={!!imageUrl} onClose={onClose} maxWidth="lg">
      <DialogContent sx={{ p: 1, bgcolor: 'background.default' }}>
        {/* A row above the image, not an overlay on top of it -- an overlay
            covered a meaningful chunk of a small logo (and clipped a corner
            of even a large photo). */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mb: 0.5 }}>
          {imageUrl && (
            <IconButton
              size="small"
              component="a"
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt={alt}
            sx={{
              display: 'block',
              maxWidth: '90vw',
              maxHeight: '85vh',
              width: 'auto',
              height: 'auto',
              borderRadius: 1,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImageLightbox;
