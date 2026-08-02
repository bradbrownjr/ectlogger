import React, { useRef, useState } from 'react';
import {
  TextField,
  Typography,
  Box,
  Tooltip,
  Divider,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import MarkdownRender from '../shared/MarkdownRender';

// ========== SHARED ANNOUNCEMENTS PANEL ==========
// Recurring/per-net announcements editor with markdown toolbar
// Used by both CreateSchedule (AnnouncementsTab) and CreateNet (Announcements tab)

interface AnnouncementsPanelProps {
  announcements: string;
  setAnnouncements: (v: string) => void;
  /** Optional extra content rendered above the toolbar (e.g. info alerts). */
  headerContent?: React.ReactNode;
  /** Rows for the textarea (default: 20). */
  rows?: number;
  /** Footer caption after the textarea (default: character count). */
  footerCaption?: string;
}

const AnnouncementsPanel: React.FC<AnnouncementsPanelProps> = ({
  announcements,
  setAnnouncements,
  headerContent,
  rows = 20,
  footerCaption,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '', isLinePrefix: boolean = false) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    let newText: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (isLinePrefix) {
      const lineStart = announcements.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = announcements.indexOf('\n', end);
      const actualLineEnd = lineEnd === -1 ? announcements.length : lineEnd;
      const lineContent = announcements.substring(lineStart, actualLineEnd);
      newText = announcements.substring(0, lineStart) + prefix + lineContent + announcements.substring(actualLineEnd);
      newCursorStart = lineStart + prefix.length;
      newCursorEnd = newCursorStart + lineContent.length;
    } else {
      const selectedText = announcements.substring(start, end);
      const textToInsert = selectedText || placeholder;
      newText = announcements.substring(0, start) + prefix + textToInsert + suffix + announcements.substring(end);
      if (selectedText) {
        newCursorStart = start + prefix.length;
        newCursorEnd = newCursorStart + selectedText.length;
      } else {
        newCursorStart = start + prefix.length + textToInsert.length + suffix.length;
        newCursorEnd = newCursorStart;
      }
    }

    setAnnouncements(newText);
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
      textarea.scrollTop = scrollTop;
    }, 0);
  };

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: headerContent ? 1 : 0 }}>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_e, v) => v && setMode(v)}>
          <ToggleButton value="write" sx={{ px: 1.5, py: 0.25 }}>Write</ToggleButton>
          <ToggleButton value="preview" sx={{ px: 1.5, py: 0.25 }}>Preview</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {headerContent}

      {mode === 'write' ? (
        <>
          {/* ========== FORMATTING TOOLBAR ========== */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Tooltip title="Heading 1">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('# ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>H1</IconButton>
            </Tooltip>
            <Tooltip title="Heading 2">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('## ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>H2</IconButton>
            </Tooltip>
            <Tooltip title="Heading 3">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('### ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>H3</IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Bold (**text**)">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}><FormatBoldIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Italic (*text*)">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}><FormatItalicIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Bulleted List">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('- ', '', '', true)}><FormatListBulletedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Numbered List">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('1. ', '', '', true)}><FormatListNumberedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Horizontal Rule">
              <IconButton type="button" size="small" onClick={() => insertMarkdown('\n---\n', '', '')}><HorizontalRuleIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Box>

          <TextField
            fullWidth value={announcements}
            onChange={(e) => setAnnouncements(e.target.value)}
            multiline rows={rows}
            inputRef={textAreaRef}
            placeholder={"## DMR Network News\n\n## Reminders\n\n## Upcoming Events\n\n## Exam Sessions"}
            sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {footerCaption ?? `${announcements.length} characters • Supports Markdown formatting`}
          </Typography>
        </>
      ) : (
        <MarkdownRender
          content={announcements}
          emptyText="Nothing to preview yet."
          variant="colored"
          sx={{ minHeight: Math.max(200, rows * 24), maxHeight: 600, overflow: 'auto', p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
        />
      )}
    </>
  );
};

export default AnnouncementsPanel;
