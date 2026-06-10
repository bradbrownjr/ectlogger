import React, { useState, useRef, useEffect } from 'react';
import { Typography, Box } from '@mui/material';

// Visible lines before truncating.
const LINE_CLAMP = 3;

interface Props {
  text: string | null | undefined;
  sx?: object;
}

const ExpandableDescription: React.FC<Props> = ({ text, sx }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const description = text || 'No description';

  useEffect(() => {
    const el = ref.current;
    if (el) {
      // Measure while clamped: scrollHeight > clientHeight means text was cut off.
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    }
  }, [description]);

  return (
    // flex: 1 lets the card's flex-column layout push the info-icon row to the
    // bottom of every card in a row, keeping them vertically aligned.
    <Box sx={{ mb: 1.5, flex: 1, ...sx }}>
      <Typography
        ref={ref as React.Ref<HTMLElement>}
        variant="body2"
        color="text.secondary"
        sx={expanded ? undefined : {
          display: '-webkit-box',
          WebkitLineClamp: LINE_CLAMP,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {description}
      </Typography>
      {overflows && (
        <Typography
          variant="body2"
          component="span"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          sx={{ color: 'primary.main', cursor: 'pointer' }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Typography>
      )}
    </Box>
  );
};

export default ExpandableDescription;
