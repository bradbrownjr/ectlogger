import React, { useRef } from 'react';
import {
  TextField,
  Typography,
  Box,
  Button,
  Tooltip,
  Divider,
  IconButton,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useCreateScheduleContext } from '../../contexts/CreateScheduleContext';

// ========== TAB 4: NET SCRIPT ==========
// Markdown script editor with formatting toolbar and file upload

const NetScriptTab: React.FC = () => {
  const { script, setScript } = useCreateScheduleContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // ---- File upload handlers ----
  const handleScriptFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setScript(e.target?.result as string);
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScriptDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => setScript(e.target?.result as string);
      reader.readAsText(file);
    }
  };

  const handleScriptDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // ---- Markdown formatting toolbar helper ----
  const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '', isLinePrefix: boolean = false) => {
    const textarea = scriptTextAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const scrollTop = textarea.scrollTop;
    let newText: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (isLinePrefix) {
      const lineStart = script.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = script.indexOf('\n', end);
      const actualLineEnd = lineEnd === -1 ? script.length : lineEnd;
      const lineContent = script.substring(lineStart, actualLineEnd);
      newText = script.substring(0, lineStart) + prefix + lineContent + script.substring(actualLineEnd);
      newCursorStart = lineStart + prefix.length;
      newCursorEnd = newCursorStart + lineContent.length;
    } else {
      const selectedText = script.substring(start, end);
      const textToInsert = selectedText || placeholder;
      newText = script.substring(0, start) + prefix + textToInsert + suffix + script.substring(end);
      if (selectedText) {
        newCursorStart = start + prefix.length;
        newCursorEnd = newCursorStart + selectedText.length;
      } else {
        newCursorStart = start + prefix.length + textToInsert.length + suffix.length;
        newCursorEnd = newCursorStart;
      }
    }

    setScript(newText);
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
      textarea.scrollTop = scrollTop;
    }, 0);
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter the net script that NCS operators will follow. Use the formatting toolbar for markdown styling.
      </Typography>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleScriptFileUpload}
        accept=".txt,.md,text/plain,text/markdown"
        style={{ display: 'none' }}
      />

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
        value={script}
        onChange={(e) => setScript(e.target.value)}
        multiline
        rows={18}
        inputRef={scriptTextAreaRef}
        placeholder={`Enter your net script here...\n\n## Opening\nGood evening, this is **[CALLSIGN]** calling the [NET NAME].\n\nThis net meets every [DAY] at [TIME] on [FREQUENCY].\n\n*Is there any emergency or priority traffic?*\n\n---\n\n## Check-Ins\nWe will now take check-ins...\n\n- Acknowledge each station\n- Note any traffic requests\n\n---\n\n## Closing\nThis concludes tonight's net. 73 to all.`}
        onDrop={handleScriptDrop}
        onDragOver={handleScriptDragOver}
        sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {script.length} characters • Supports Markdown formatting
        </Typography>
        <Button
          type="button"
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload .txt or .md file
        </Button>
      </Box>
    </>
  );
};

export default NetScriptTab;
