import React, { useState, useEffect, useRef } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  useTheme,
  TextField,
  Button,
  Tooltip,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { Rnd } from 'react-rnd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { templateApi } from '../services/api';

interface NetScriptProps {
  open: boolean;
  onClose: () => void;
  script: string;
  netName: string;
  netId: number;
  templateId?: number;
  canEdit?: boolean;
  onSaved?: (newScript: string) => void;
}

// CommonMark requires no whitespace adjacent to bold/italic delimiters.
// Normalize trailing/leading spaces inside ** and * spans so hand-written
// or pasted content (e.g. "**text **") renders correctly.
function normalizeMarkdownDelimiters(text: string): string {
  return text
    .replace(/\*\*\s+(.*?)\s+\*\*/g, '**$1**')
    .replace(/\*\*\s+(.*?)\*\*/g, '**$1**')
    .replace(/\*\*(.*?)\s+\*\*/g, '**$1**')
    .replace(/\*(?!\*)\s+(.*?)\s+\*(?!\*)/g, '*$1*')
    .replace(/\*(?!\*)\s+(.*?)\*(?!\*)/g, '*$1*')
    .replace(/\*(?!\*)(.*?)\s+\*(?!\*)/g, '*$1*');
}

const NetScript: React.FC<NetScriptProps> = ({
  open,
  onClose,
  script,
  netName,
  netId: _netId,
  templateId,
  canEdit = false,
  onSaved,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [minimized, setMinimized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(script);
  const [saving, setSaving] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const [windowState, setWindowState] = useState({
    x: 50,
    y: 100,
    width: 500,
    height: 400,
  });
  // Track expanded height so minimize/restore doesn't reset a user-resized window
  const expandedHeightRef = useRef(400);

  const handleMinimizeToggle = () => {
    if (!minimized) {
      expandedHeightRef.current = windowState.height;
      setWindowState(prev => ({ ...prev, height: 48 }));
    } else {
      setWindowState(prev => ({ ...prev, height: expandedHeightRef.current }));
    }
    setMinimized(prev => !prev);
  };

  // Keep edit buffer in sync when script prop changes externally
  useEffect(() => {
    if (!editing) setEditValue(script);
  }, [script, editing]);

  const insertMarkdown = (prefix: string, suffix: string = '', placeholder: string = '', linePrefix = false) => {
    const ta = textAreaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const scroll = ta.scrollTop;
    let newText: string, cursorStart: number, cursorEnd: number;

    if (linePrefix) {
      const lineStart = editValue.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = editValue.indexOf('\n', end);
      const actualEnd = lineEnd === -1 ? editValue.length : lineEnd;
      const lineContent = editValue.substring(lineStart, actualEnd);
      newText = editValue.substring(0, lineStart) + prefix + lineContent + editValue.substring(actualEnd);
      cursorStart = lineStart + prefix.length;
      cursorEnd = cursorStart + lineContent.length;
    } else {
      const selected = editValue.substring(start, end);
      const insert = selected || placeholder;
      newText = editValue.substring(0, start) + prefix + insert + suffix + editValue.substring(end);
      cursorStart = selected ? start + prefix.length : start + prefix.length + insert.length + suffix.length;
      cursorEnd = selected ? cursorStart + selected.length : cursorStart;
    }

    setEditValue(newText);
    setTimeout(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(cursorStart, cursorEnd);
      ta.scrollTop = scroll;
    }, 0);
  };

  const handleSave = async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      await templateApi.update(templateId, { script: editValue });
      onSaved?.(editValue);
      setEditing(false);
    } catch {
      // leave edit mode open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(script);
    setEditing(false);
  };

  const handleOpenInNewTab = () => {
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      const htmlContent = script
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$2</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>')
        .replace(/^---$/gim, '<hr>')
        .replace(/\n/g, '<br>')
        .replace(/<br><h/g, '<h')
        .replace(/<\/h(\d)><br>/g, '</h$1>')
        .replace(/<br><hr><br>/g, '<hr>')
        .replace(/<br><li>/g, '<li>')
        .replace(/<\/li><br>/g, '</li>');

      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Net Script - ${netName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; background-color: #f5f5f5; }
            .header { color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px; margin-bottom: 20px; }
            .content { background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
            h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
            h1 { font-size: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
            h2 { font-size: 1.3em; }
            h3 { font-size: 1.1em; }
            ul, ol { padding-left: 1.5em; }
            li { margin: 0.3em 0; }
            hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
            @media print { body { background: white; } .content { box-shadow: none; border: 1px solid #ccc; } }
          </style>
        </head>
        <body>
          <h1 class="header">📻 ${netName} - Net Script</h1>
          <div class="content">${htmlContent}</div>
        </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  if (!open) return null;

  return (
    <Rnd
      size={{ width: windowState.width, height: windowState.height }}
      position={{ x: windowState.x, y: windowState.y }}
      onDragStop={(_e: any, d: any) => setWindowState(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, position: any) => {
        setWindowState({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), ...position });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 200}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={!minimized}
      style={{ zIndex: 1300 }}
    >
      <Paper elevation={8} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        {/* ========== TITLE BAR ========== */}
        <Box
          className="drag-handle"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: isDarkMode ? '#1565c0' : 'primary.main', color: '#ffffff', cursor: 'move', flexShrink: 0 }}
        >
          <Typography variant="subtitle1" fontWeight="bold">Net Script</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {!editing && canEdit && templateId && (
              <Tooltip title="Edit script">
                <IconButton size="small" onClick={() => { setEditValue(script); setEditing(true); }} sx={{ color: 'inherit' }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {editing && (
              <>
                <Button size="small" variant="contained" color="success" onClick={handleSave} disabled={saving}
                  sx={{ py: 0, px: 1, minWidth: 0, fontSize: '0.75rem', color: '#fff' }}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="small" onClick={handleCancel} disabled={saving}
                  sx={{ py: 0, px: 1, minWidth: 0, fontSize: '0.75rem', color: 'inherit' }}>
                  Cancel
                </Button>
              </>
            )}
            {!editing && (
              <IconButton size="small" onClick={handleOpenInNewTab} sx={{ color: 'inherit' }} title="Open in new tab">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton size="small" onClick={handleMinimizeToggle} sx={{ color: 'inherit' }}>
              {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* ========== CONTENT ========== */}
        {/* Keep content mounted (display:none when minimized) to preserve scroll position */}
        <Box sx={{ flex: 1, display: minimized ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {editing ? (
            <>
              {/* Formatting toolbar */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Tooltip title="H1"><IconButton size="small" onClick={() => insertMarkdown('# ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>H1</IconButton></Tooltip>
                <Tooltip title="H2"><IconButton size="small" onClick={() => insertMarkdown('## ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>H2</IconButton></Tooltip>
                <Tooltip title="H3"><IconButton size="small" onClick={() => insertMarkdown('### ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>H3</IconButton></Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Bold"><IconButton size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}><FormatBoldIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Italic"><IconButton size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}><FormatItalicIcon fontSize="small" /></IconButton></Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Bullet list"><IconButton size="small" onClick={() => insertMarkdown('- ', '', 'List item', true)}><FormatListBulletedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Numbered list"><IconButton size="small" onClick={() => insertMarkdown('1. ', '', 'List item', true)}><FormatListNumberedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Divider"><IconButton size="small" onClick={() => insertMarkdown('\n---\n')}><HorizontalRuleIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
              {/* Editor */}
              <TextField
                multiline
                fullWidth
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                inputRef={textAreaRef}
                variant="outlined"
                sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start', fontFamily: 'monospace', fontSize: '0.85rem' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& textarea': { resize: 'none' } }}
                InputProps={{ sx: { height: '100%' } }}
              />
            </>
          ) : (
            <Box
              sx={{
                flex: 1, p: 2, overflow: 'auto', fontSize: '0.95rem', lineHeight: 1.6,
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
              }}
            >
              {script ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdownDelimiters(script)}</ReactMarkdown>
              ) : (
                <Typography color="text.secondary" fontStyle="italic">No script defined for this net.</Typography>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </Rnd>
  );
};

export default NetScript;
