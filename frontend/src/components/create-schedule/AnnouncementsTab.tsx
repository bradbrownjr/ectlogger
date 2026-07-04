import React, { useRef } from 'react';
import {
  TextField,
  Typography,
  Box,
  Tooltip,
  Divider,
  IconButton,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 5: ANNOUNCEMENTS ==========
// Recurring announcements document with markdown formatting toolbar

const AnnouncementsTab: React.FC = () => {
  const { announcements, setAnnouncements } = useCreateScheduleContext();

  const announcementsTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // ---- Markdown formatting toolbar helper ----
  const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '', isLinePrefix: boolean = false) => {
    const textarea = announcementsTextAreaRef.current;
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter recurring announcements NCS reads each net — upcoming events, club reminders, network news, exam sessions, etc. Use Markdown for sections and formatting. This document is available in the Announcements window during every live net from this schedule.
      </Typography>

      {/* ========== FORMATTING TOOLBAR ========== */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Tooltip title="Heading 1">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('# ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
            H1
          </IconButton>
        </Tooltip>
        <Tooltip title="Heading 2">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('## ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
            H2
          </IconButton>
        </Tooltip>
        <Tooltip title="Heading 3">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('### ', '', '', true)} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>
            H3
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Bold (**text**)">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}>
            <FormatBoldIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Italic (*text*)">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}>
            <FormatItalicIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Bulleted List">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('- ', '', '', true)}>
            <FormatListBulletedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Numbered List">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('1. ', '', '', true)}>
            <FormatListNumberedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Horizontal Rule">
          <IconButton type="button" size="small" onClick={() => insertMarkdown('\n---\n', '', '')}>
            <HorizontalRuleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        fullWidth
        value={announcements}
        onChange={(e) => setAnnouncements(e.target.value)}
        multiline
        rows={20}
        inputRef={announcementsTextAreaRef}
        placeholder={"## DMR Network News\n\n## Reminders\n\n## Upcoming Events\n\n## Exam Sessions"}
        sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
      />

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {announcements.length} characters • Supports Markdown formatting • Saved with the schedule on Save Changes
      </Typography>
    </>
  );
};

export default AnnouncementsTab;
