import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Footer shared by the tabbed Create/Edit Net and Create/Edit Schedule forms.
//
// Desktop: one row, Cancel/Previous/Next on the left and the submit
// button(s) on the right.
// Phone (xs): exactly two rows. Row 1 is Cancel | Previous | Next in equal
// thirds, each always in its own column so Next never shifts when Previous
// is hidden on the first tab; icons are dropped and padding tightened so
// "Previous" fits a ~270 px card. Row 2 is the submit button(s), full width
// (two submits split it evenly; their labels may take two lines).
interface FormWizardFooterProps {
  cancelLabel?: string;
  onCancel: () => void;
  /** Omit to hide Previous (first tab). */
  onPrevious?: () => void;
  /** Omit to hide Next (last tab). */
  onNext?: () => void;
  nextDisabled?: boolean;
  /** Validation hint explaining why Next is disabled. */
  nextHint?: string | null;
  /** Submit button(s). */
  children?: React.ReactNode;
}

// Phone-only button compaction for row 1: no icons, 8 px side padding.
const compactOnPhone = {
  '& .MuiButton-root': { px: { xs: 1, sm: '15px' }, minWidth: 0 },
  '& .MuiButton-startIcon, & .MuiButton-endIcon': { display: { xs: 'none', sm: 'inherit' } },
};

const FormWizardFooter: React.FC<FormWizardFooterProps> = ({
  cancelLabel = 'Cancel',
  onCancel,
  onPrevious,
  onNext,
  nextDisabled,
  nextHint,
  children,
}) => (
  <Box
    sx={{
      mt: 4,
      pt: 2,
      borderTop: 1,
      borderColor: 'divider',
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      flexWrap: { sm: 'wrap' },
      gap: 2,
      justifyContent: 'space-between',
      alignItems: { sm: 'flex-start' },
    }}
  >
    {/* ========== ROW 1: NAVIGATION (Cancel / Previous / Next) ========== */}
    <Box>
      <Box
        sx={{
          display: { xs: 'grid', sm: 'flex' },
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: { xs: 1, sm: 2 },
          ...compactOnPhone,
        }}
      >
        <Button type="button" variant="outlined" onClick={onCancel} startIcon={<CloseIcon />} sx={{ gridColumn: { xs: 1 } }}>
          {cancelLabel}
        </Button>
        {onPrevious && (
          <Button type="button" variant="outlined" onClick={onPrevious} startIcon={<ArrowBackIcon />} sx={{ gridColumn: { xs: 2 } }}>
            Previous
          </Button>
        )}
        {onNext && (
          <Button
            type="button"
            variant="outlined"
            onClick={onNext}
            endIcon={<ArrowForwardIcon />}
            disabled={nextDisabled}
            sx={{ gridColumn: { xs: 3 } }}
          >
            Next
          </Button>
        )}
      </Box>
      {/* Shows only while Next is blocked by a missing required field */}
      {onNext && nextHint && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
          {nextHint}
        </Typography>
      )}
    </Box>

    {/* ========== ROW 2: SUBMIT ========== */}
    {children && (
      <Box
        sx={{
          display: { xs: 'grid', sm: 'flex' },
          gridAutoFlow: 'column',
          gridAutoColumns: '1fr',
          gap: { xs: 1, sm: 2 },
          ml: { sm: 'auto' },
          '& .MuiButton-root': { px: { xs: 1, sm: '15px' } },
        }}
      >
        {children}
      </Box>
    )}
  </Box>
);

export default FormWizardFooter;
