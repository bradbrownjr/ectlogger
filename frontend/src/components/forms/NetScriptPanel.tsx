import React, { useRef, useState } from 'react';
import {
  TextField,
  Typography,
  Box,
  Button,
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
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MarkdownRender from '../shared/MarkdownRender';

// ========== SHARED NET SCRIPT PANEL ==========
// Markdown script editor with formatting toolbar and file upload
// Used by both CreateSchedule (NetScriptTab) and CreateNet (Net Script tab)

interface NetScriptPanelProps {
  script: string;
  setScript: (v: string) => void;
}

const NetScriptPanel: React.FC<NetScriptPanelProps> = ({ script, setScript }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Enter the net script that NCS operators will follow. Use the formatting toolbar for markdown styling.
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_e, v) => v && setMode(v)} sx={{ flexShrink: 0 }}>
          <ToggleButton value="write" sx={{ px: 1.5, py: 0.25 }}>Write</ToggleButton>
          <ToggleButton value="preview" sx={{ px: 1.5, py: 0.25 }}>Preview</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <input
        type="file" ref={fileInputRef} onChange={handleScriptFileUpload}
        accept=".txt,.md,text/plain,text/markdown" style={{ display: 'none' }}
      />

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
            fullWidth value={script}
            onChange={(e) => setScript(e.target.value)}
            multiline rows={18}
            inputRef={scriptTextAreaRef}
            placeholder={`Enter your net script here...\n\n## Opening\nGood evening, this is **[CALLSIGN]** calling the [NET NAME].\n\nThis net meets every [DAY] at [TIME] on [FREQUENCY].\n\n*Is there any emergency or priority traffic?*\n\n---\n\n## Check-Ins\nWe will now take check-ins...\n\n- Acknowledge each station\n- Note any traffic requests\n\n---\n\n## Closing\nThis concludes tonight's net. 73 to all.`}
            onDrop={handleScriptDrop}
            onDragOver={(e: React.DragEvent) => e.preventDefault()}
            sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {script.length} characters • Supports Markdown formatting
            </Typography>
            <Button type="button" size="small" startIcon={<UploadFileIcon />} onClick={() => fileInputRef.current?.click()}>
              Upload .txt or .md file
            </Button>
          </Box>
        </>
      ) : (
        <MarkdownRender
          content={script}
          emptyText="Nothing to preview yet."
          variant="bordered"
          sx={{ minHeight: 432, maxHeight: 600, overflow: 'auto', p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}
        />
      )}
    </>
  );
};

export default NetScriptPanel;
