import React, { useState, useEffect, useRef } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  TextField,
  Button,
  Tooltip,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { Rnd } from 'react-rnd';
import { templateApi } from '../services/api';
import MarkdownRender from './shared/MarkdownRender';
import useEditDraft from '../hooks/useEditDraft';

interface ScheduleAnnouncementsProps {
  open: boolean;
  onClose: () => void;
  templateId: number;
  netName: string;
  canEdit?: boolean;
  // Renders filling 100% of its parent with no Rnd/drag chrome, for docking
  // into NetView's layout (see NetViewLeftPanels.tsx) instead of floating.
  embedded?: boolean;
  // Moves the panel from docked back to the floating overlay - only
  // meaningful (and only rendered) in embedded mode.
  onUndock?: () => void;
  // Moves the panel from floating into NetView's docked layout - only
  // rendered (by the parent passing it) once the viewport is wide enough.
  onDock?: () => void;
  // Controlled minimize state for embedded (docked) mode only, so the
  // parent (NetViewLeftPanels) can expand a sibling pane into the freed
  // space - mirrors Chat.tsx's pattern. Floating mode keeps its own
  // internal minimize state (tied to the Rnd window height) untouched.
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const ScheduleAnnouncements: React.FC<ScheduleAnnouncementsProps> = ({
  open,
  onClose,
  templateId,
  netName,
  canEdit = false,
  embedded = false,
  onUndock,
  onDock,
  minimized: dockedMinimized = false,
  onMinimize: onDockedMinimize,
  onRestore: onDockedRestore,
}) => {
  const [minimized, setMinimized] = useState(false);
  const [announcements, setAnnouncements] = useState('');
  const { editing, setEditing, editValue, setEditValue } = useEditDraft(
    templateId ? `schedule-announcements:${templateId}` : null,
    ''
  );
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const [windowState, setWindowState] = useState({
    x: 100,
    y: 100,
    width: 500,
    height: 400,
  });
  const expandedHeightRef = useRef(400);

  useEffect(() => {
    if (open && templateId) {
      templateApi.get(templateId)
        .then(res => {
          const text = res.data.announcements || '';
          setAnnouncements(text);
          // Never over-write an edit in progress -- this fetch also runs when
          // the panel is remounted mid-edit (see useEditDraft).
          if (!editing) setEditValue(text);
        })
        .catch(() => { setAnnouncements(''); if (!editing) setEditValue(''); });
    }
  }, [open, templateId]);

  const handleMinimizeToggle = () => {
    if (!minimized) {
      expandedHeightRef.current = windowState.height;
      setWindowState(prev => ({ ...prev, height: 48 }));
    } else {
      setWindowState(prev => ({ ...prev, height: expandedHeightRef.current }));
    }
    setMinimized(prev => !prev);
  };

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

  const insertLink = () => {
    const url = window.prompt('Link URL:', 'https://');
    if (!url) return;
    insertMarkdown('[', `](${url})`, 'link text');
  };

  const handleSave = async () => {
    setSaving(true);
    // Trailing spaces/tabs are invisible and don't do anything useful now
    // that remark-breaks (see renderContent below) turns every line break
    // into a real line break on its own - strip them so saved content
    // matches what the editor showed.
    const trimmed = editValue.replace(/[ \t]+$/gm, '');
    try {
      await templateApi.update(templateId, { announcements: trimmed });
      setEditValue(trimmed);
      setAnnouncements(trimmed);
      setEditing(false);
      setPreviewing(false);
    } catch {
      // leave edit mode open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(announcements);
    setEditing(false);
    setPreviewing(false);
  };

  const handleOpenInNewTab = () => {
    const newWindow = window.open('', '_blank', 'width=900,height=800,resizable=yes');
    if (newWindow) {
      const htmlContent = announcements
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
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
          <title>Announcements - ${netName}</title>
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
          <h1 class="header">Announcements — ${netName}</h1>
          <div class="content">${htmlContent}</div>
        </body>
        </html>
      `);
      newWindow.document.close();
      onClose();
    }
  };

  // Editing toolbar + textarea, or the rendered markdown - shared by the
  // floating (Rnd) and embedded (docked) render modes below.
  const renderContent = (contentMinimized: boolean) => (
    <Box sx={{ flex: 1, display: contentMinimized ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {editing ? (
        <>
          {/* Formatting toolbar + Write/Preview toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            {previewing ? <Box /> : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title="H1"><IconButton size="small" onClick={() => insertMarkdown('# ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>H1</IconButton></Tooltip>
                <Tooltip title="H2"><IconButton size="small" onClick={() => insertMarkdown('## ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}>H2</IconButton></Tooltip>
                <Tooltip title="H3"><IconButton size="small" onClick={() => insertMarkdown('### ', '', 'Heading', true)} sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}>H3</IconButton></Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Bold"><IconButton size="small" onClick={() => insertMarkdown('**', '**', 'bold text')}><FormatBoldIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Italic"><IconButton size="small" onClick={() => insertMarkdown('*', '*', 'italic text')}><FormatItalicIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Link"><IconButton size="small" onClick={insertLink}><LinkIcon fontSize="small" /></IconButton></Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Bullet list"><IconButton size="small" onClick={() => insertMarkdown('- ', '', 'List item', true)}><FormatListBulletedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Numbered list"><IconButton size="small" onClick={() => insertMarkdown('1. ', '', 'List item', true)}><FormatListNumberedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Divider"><IconButton size="small" onClick={() => insertMarkdown('\n---\n')}><HorizontalRuleIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
            )}
            <ToggleButtonGroup size="small" exclusive value={previewing ? 'preview' : 'write'} onChange={(_e, v) => v && setPreviewing(v === 'preview')} sx={{ flexShrink: 0 }}>
              <ToggleButton value="write" sx={{ px: 1, py: 0.25 }}><Tooltip title="Write"><EditIcon fontSize="small" /></Tooltip></ToggleButton>
              <ToggleButton value="preview" sx={{ px: 1, py: 0.25 }}><Tooltip title="Preview"><VisibilityIcon fontSize="small" /></Tooltip></ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {previewing ? (
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <MarkdownRender
                content={editValue}
                emptyText="Nothing to preview yet."
                variant="colored"
                sx={{ p: 2, backgroundColor: 'background.paper' }}
              />
            </Box>
          ) : (
            /* Editor - rows=1 (overridden to 100% height below) opts out of
               MUI's autosize-to-content behavior, which has no cap and was
               growing past the visible area with nothing to scroll it into
               view - see textarea overflowY below. */
            <TextField
              multiline
              rows={1}
              fullWidth
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              inputRef={textAreaRef}
              variant="outlined"
              sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start', fontFamily: 'monospace', fontSize: '0.85rem' }, '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& textarea': { resize: 'none', height: '100% !important', overflowY: 'auto' } }}
              InputProps={{ sx: { height: '100%' } }}
            />
          )}
        </>
      ) : (
        <MarkdownRender
          content={announcements}
          emptyText="No schedule announcements have been defined."
          variant="colored"
          sx={{ flex: 1, p: 2, overflowY: 'auto', backgroundColor: 'background.paper' }}
        />
      )}
    </Box>
  );

  // Editing toolbar buttons shared by both title bars below.
  const renderEditControls = () => (
    <>
      {!editing && canEdit && (
        <Tooltip title="Edit announcements">
          <IconButton size="small" onClick={() => { setEditValue(announcements); setEditing(true); setPreviewing(false); }} sx={{ color: 'inherit' }}>
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
    </>
  );

  if (embedded) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5, backgroundColor: 'background.default', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight="bold">Announcements</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {renderEditControls()}
            {!editing && (onDockedMinimize || onDockedRestore) && (
              <IconButton size="small" onClick={dockedMinimized ? onDockedRestore : onDockedMinimize} sx={{ p: 0.25 }} title={dockedMinimized ? 'Restore' : 'Minimize'}>
                {dockedMinimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
              </IconButton>
            )}
            {onUndock && (
              <IconButton size="small" onClick={onUndock} sx={{ p: 0.25 }} title="Detach to floating window">
                <PictureInPictureAltIcon fontSize="small" />
              </IconButton>
            )}
            {!editing && (
              <IconButton size="small" onClick={handleOpenInNewTab} sx={{ p: 0.25 }} title="Open in new window">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton size="small" onClick={onClose} sx={{ p: 0.25 }} title="Close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        {renderContent(dockedMinimized)}
      </Box>
    );
  }

  if (!open) return null;

  return (
    <Rnd
      style={{ zIndex: 1300 }}
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.width, height: windowState.height }}
      onDragStop={(_e, d) => setWindowState(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        setWindowState({ x: position.x, y: position.y, width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 200}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={!minimized}
    >
      <Paper
        elevation={8}
        sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.paper', overflow: 'hidden' }}
      >
        {/* ========== TITLE BAR ========== */}
        {/* Uses primary.contrastText (not a hardcoded white) since some named
            themes' primary is light enough that MUI itself picks dark text
            for contrast — see DESIGN.md "Multi-theme compliance". */}
        <Box
          className="drag-handle"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: 'primary.main', color: 'primary.contrastText', cursor: 'move', flexShrink: 0 }}
        >
          <Typography variant="subtitle1" fontWeight="bold">Announcements</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {renderEditControls()}
            {!editing && (
              <IconButton size="small" onClick={handleOpenInNewTab} sx={{ color: 'inherit' }} title="Open in new window">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            {!editing && onDock && (
              <IconButton size="small" onClick={onDock} sx={{ color: 'inherit' }} title="Dock to layout">
                <ViewSidebarIcon fontSize="small" />
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
        {renderContent(minimized)}
      </Paper>
    </Rnd>
  );
};

export default ScheduleAnnouncements;
