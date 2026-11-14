import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// ========== FOLDING FORM SECTION ==========
// A group of optional settings on a long form that folds away when none of
// them is in use. The folded row still says what is inside (an option
// count) and what is on (one chip per option that is on), and reads as
// something to open ("Show options" in the primary color, with the arrow).
// Rules: docs/DESIGN.md "Folding Form Sections". Whether a section starts
// open is the caller's decision (utils/netFeatureSections.ts for the net and
// schedule forms); this component only draws it.

interface FoldingFormSectionProps {
  // Used for the summary/details ids that tie the button to its region
  id: string;
  title: string;
  caption: string;
  optionCount: number;
  // One short label per option that is on
  chips: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
}

const FoldingFormSection: React.FC<FoldingFormSectionProps> = ({
  id,
  title,
  caption,
  optionCount,
  chips,
  expanded,
  onExpandedChange,
  children,
}) => (
  <Accordion
    expanded={expanded}
    onChange={(_, isExpanded) => onExpandedChange(isExpanded)}
    variant="outlined"
    elevation={0}
    disableGutters
    sx={{ mt: 2, borderRadius: 1, '&:before': { display: 'none' } }}
  >
    <AccordionSummary
      id={`${id}-header`}
      aria-controls={`${id}-content`}
      expandIcon={<ExpandMoreIcon color="primary" />}
      sx={{ '& .MuiAccordionSummary-content': { my: 1.5, minWidth: 0 } }}
    >
      {/* Wraps on a phone: title and count, then "Show options" pushed right,
          then the caption and the chips each on their own line. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1, rowGap: 0.5, width: '100%' }}>
        <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'bold' }}>
          {title}
        </Typography>
        <Typography variant="body2" component="span" color="text.secondary">
          {optionCount} options
        </Typography>
        <Typography
          variant="body2"
          component="span"
          color="primary"
          sx={{ ml: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {expanded ? 'Hide' : 'Show options'}
        </Typography>
        <Typography variant="caption" component="span" color="text.secondary" sx={{ flexBasis: '100%' }}>
          {caption}
        </Typography>
        {/* Shows when at least one option in the section is on */}
        {chips.length > 0 && (
          <Box sx={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {chips.map((chip) => (
              <Chip key={chip} label={chip} size="small" color="primary" variant="outlined" />
            ))}
          </Box>
        )}
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      {children}
    </AccordionDetails>
  </Accordion>
);

export default FoldingFormSection;
