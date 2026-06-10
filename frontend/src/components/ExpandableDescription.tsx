import React, { useState } from 'react';
import { Typography, Box } from '@mui/material';

const TRUNCATE_AT = 150;

interface Props {
  text: string | null | undefined;
  sx?: object;
}

const ExpandableDescription: React.FC<Props> = ({ text, sx }) => {
  const [expanded, setExpanded] = useState(false);
  const description = text || 'No description';
  const needsTruncation = description.length > TRUNCATE_AT;

  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, ...sx }}>
      {!needsTruncation && description}
      {needsTruncation && (
        <>
          {expanded ? description : `${description.slice(0, TRUNCATE_AT).trimEnd()}…`}
          {' '}
          <Box
            component="span"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            sx={{ color: 'primary.main', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Box>
        </>
      )}
    </Typography>
  );
};

export default ExpandableDescription;
