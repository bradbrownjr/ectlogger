import React from 'react';
import { Box, Typography, SxProps, Theme } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkFlexibleMarkers from 'remark-flexible-markers';

// ========== SHARED MARKDOWN RENDER ==========
// Rendered markdown output shared by the net script / notes / announcements
// editors and their floating dialogs, so all consumers stay visually and
// behaviorally identical instead of drifting across copies.

// CommonMark requires no whitespace adjacent to bold/italic delimiters.
// Normalize trailing/leading spaces inside ** and * spans so hand-written
// or pasted content (e.g. "**text **") renders correctly.
export function normalizeMarkdownDelimiters(text: string): string {
  return text
    .replace(/\*\*\s+(.*?)\s+\*\*/g, '**$1**')
    .replace(/\*\*\s+(.*?)\*\*/g, '**$1**')
    .replace(/\*\*(.*?)\s+\*\*/g, '**$1**')
    .replace(/\*(?!\*)\s+(.*?)\s+\*(?!\*)/g, '*$1*')
    .replace(/\*(?!\*)\s+(.*?)\*(?!\*)/g, '*$1*')
    .replace(/\*(?!\*)(.*?)\s+\*(?!\*)/g, '*$1*');
}

// "bordered": h1 gets a divider underline, no heading color (NetScript dialog)
// "colored": headings use primary.main, no underline (Announcements / ScheduleAnnouncements dialogs)
const borderedHeadingStyles: SxProps<Theme> = {
  '& h1, & h2, & h3': { mt: 2, mb: 1, '&:first-of-type': { mt: 0 } },
  '& h1': { fontSize: '1.5rem', borderBottom: 1, borderColor: 'divider', pb: 1 },
  '& h2': { fontSize: '1.25rem' },
  '& h3': { fontSize: '1.1rem' },
  '& p': { my: 1 },
  '& ul, & ol': { pl: 3, my: 1 },
  '& li': { my: 0.5 },
  '& hr': { my: 2, border: 'none', borderTop: 1, borderColor: 'divider' },
  '& strong': { fontWeight: 'bold' },
  '& em': { fontStyle: 'italic' },
  '& a': { color: 'primary.main' },
  '& mark': { backgroundColor: '#fff59d', color: 'rgba(0, 0, 0, 0.87)', borderRadius: '2px', px: '2px' },
};

const coloredHeadingStyles: SxProps<Theme> = {
  '& h1, & h2, & h3': { mt: 2, mb: 1, color: 'primary.main' },
  '& h1:first-of-type, & h2:first-of-type, & h3:first-of-type': { mt: 0 },
  '& ul, & ol': { pl: 3, my: 1 },
  '& li': { my: 0.5 },
  '& hr': { border: 'none', borderTop: '1px solid', borderColor: 'divider', my: 2 },
  '& p': { my: 1 },
  '& strong': { fontWeight: 'bold' },
  '& em': { fontStyle: 'italic' },
  '& a': { color: 'primary.main' },
  '& mark': { backgroundColor: '#fff59d', color: 'rgba(0, 0, 0, 0.87)', borderRadius: '2px', px: '2px' },
};

interface MarkdownRenderProps {
  content: string;
  emptyText: string;
  variant?: 'bordered' | 'colored';
  sx?: SxProps<Theme>;
}

const MarkdownRender: React.FC<MarkdownRenderProps> = ({ content, emptyText, variant = 'colored', sx }) => (
  <Box sx={{ ...(variant === 'bordered' ? borderedHeadingStyles : coloredHeadingStyles), ...sx }}>
    {content ? (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkFlexibleMarkers]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {normalizeMarkdownDelimiters(content)}
      </ReactMarkdown>
    ) : (
      <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>{emptyText}</Typography>
    )}
  </Box>
);

export default MarkdownRender;
