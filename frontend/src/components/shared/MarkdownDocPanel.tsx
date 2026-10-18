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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import HighlightIcon from '@mui/icons-material/Highlight';
import LinkIcon from '@mui/icons-material/Link';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { Rnd } from 'react-rnd';
import { useFloatingRect } from '../../hooks/useFloatingRect';
import { FLOATING_DRAG_CANCEL, fitFloatingRect } from '../../utils/floatingWindow';
import useEditDraft from '../../hooks/useEditDraft';
import MarkdownRender from './MarkdownRender';
import { exportMarkdownDocsPdf, pdfFileStem } from '../../utils/markdownDocsPdf';

// ========== MARKDOWN DOCUMENT PANEL ==========
// The one panel behind the net's three Markdown documents: Net Script
// (NetScript.tsx), the schedule's Announcements (ScheduleAnnouncements.tsx)
// and the net's own Net Notes (Announcements.tsx). Those three files are now
// thin wrappers that say what the text is and where it saves. They were three
// ~400-line copies until 2026-10-15, and had drifted: the script's own
// "Open in new window" converter turned every `##` heading into `$2`.
//
// Render modes, all from this one component:
// - floating: the in-page Rnd overlay (default)
// - embedded: fills its parent; used docked in NetViewLeftPanels and, with
//   no chrome props at all, as a real popped-out window (NetPaneWindow.tsx)
//   where the browser's own window controls replace close/minimize/detach.

interface MarkdownDocPanelProps {
  // Panel title, also the PDF's label and filename suffix ("Net Script").
  title: string;
  content: string;
  emptyText: string;
  netName: string;
  open: boolean;
  // Absent in a popped-out window, where the browser closes it.
  onClose?: () => void;
  canEdit: boolean;
  editTooltip: string;
  // sessionStorage key for an unsaved edit (see useEditDraft), or null.
  draftKey: string | null;
  // Throws to keep the editor open so the user can retry.
  onSave: (text: string) => Promise<void>;
  // Heading style of the rendered text (see MarkdownRender).
  look: 'bordered' | 'colored';
  allowHighlight?: boolean;
  defaultX?: number;
  embedded?: boolean;
  // Docked -> floating overlay (embedded mode only).
  onUndock?: () => void;
  // Floating -> docked, passed only once the viewport is wide enough.
  onDock?: () => void;
  // Opens this panel in its own browser window (usePoppedOutWindow).
  onPopOut?: () => void;
  // Controlled minimize for embedded (docked) mode, so NetViewLeftPanels can
  // give the freed space to a sibling. Floating keeps its own state below.
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const MarkdownDocPanel: React.FC<MarkdownDocPanelProps> = ({
  title,
  content,
  emptyText,
  netName,
  open,
  onClose,
  canEdit,
  editTooltip,
  draftKey,
  onSave,
  look,
  allowHighlight = false,
  defaultX = 50,
  embedded = false,
  onUndock,
  onDock,
  onPopOut,
  minimized: dockedMinimized = false,
  onMinimize: onDockedMinimize,
  onRestore: onDockedRestore,
}) => {
  const [minimized, setMinimized] = useState(false);
  const { editing, setEditing, editValue, setEditValue } = useEditDraft(draftKey, content);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Fitted to the page, so on a phone it opens screen-width with its
  // title-bar buttons reachable and stays on the page when rotated.
  const [windowState, setWindowState] = useFloatingRect({
    x: defaultX,
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
      // Refit: the page may have changed size (rotated) while minimized.
      setWindowState(prev => fitFloatingRect({ ...prev, height: expandedHeightRef.current }));
    }
    setMinimized(prev => !prev);
  };

  // Keep the edit buffer in sync when the text changes from outside, but
  // never over an edit in progress.
  useEffect(() => {
    if (!editing) setEditValue(content);
  }, [content, editing]);

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
    // that remark-breaks turns every line break into a real line break on
    // its own - strip them so saved content matches what the editor showed.
    const trimmed = editValue.replace(/[ \t]+$/gm, '');
    try {
      await onSave(trimmed);
      setEditValue(trimmed);
      setEditing(false);
      setPreviewing(false);
    } catch {
      // leave edit mode open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(content);
    setEditing(false);
    setPreviewing(false);
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportMarkdownDocsPdf({
        netName,
        label: title,
        sections: [{ title, content }],
        filename: `${pdfFileStem(netName)}_${pdfFileStem(title)}`,
      });
    } catch (error) {
      console.error(`Failed to export ${title} PDF:`, error);
    } finally {
      setExporting(false);
    }
  };

  const renderedSx = look === 'bordered'
    ? { fontSize: '0.95rem', lineHeight: 1.6 }
    : { backgroundColor: 'background.paper' };

  // Editing toolbar + textarea, or the rendered markdown - shared by every
  // render mode below.
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
                {allowHighlight && (
                  <Tooltip title="Highlight"><IconButton size="small" onClick={() => insertMarkdown('==', '==', 'highlighted text')}><HighlightIcon fontSize="small" /></IconButton></Tooltip>
                )}
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
                variant={look}
                sx={{ p: 2, ...renderedSx }}
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
          content={content}
          emptyText={emptyText}
          variant={look}
          sx={{ flex: 1, p: 2, overflowY: 'auto', ...renderedSx }}
        />
      )}
    </Box>
  );

  // Pencil (or Save/Cancel while editing) and the PDF button beside it,
  // shared by both title bars below. PDF saves the saved text, so it is
  // hidden mid-edit, and there is nothing to save when the text is empty.
  const renderEditControls = (buttonSx: object) => (
    <>
      {!editing && canEdit && (
        <Tooltip title={editTooltip}>
          <IconButton size="small" onClick={() => { setEditValue(content); setEditing(true); setPreviewing(false); }} sx={buttonSx}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {!editing && content.trim() !== '' && (
        // The span keeps the tooltip working while the button is disabled
        // mid-export; the label sits on the button itself for screen readers.
        <Tooltip title="Download as PDF">
          <span>
            <IconButton size="small" aria-label="Download as PDF" onClick={handleExportPdf} disabled={exporting} sx={buttonSx}>
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
          </span>
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

  // ========== EMBEDDED: docked, or a popped-out window ==========
  if (embedded) {
    const chromeSx = { p: 0.25 };
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5, backgroundColor: 'background.default', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight="bold">{title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {renderEditControls({ color: 'inherit' })}
            {!editing && (onDockedMinimize || onDockedRestore) && (
              <IconButton size="small" onClick={dockedMinimized ? onDockedRestore : onDockedMinimize} sx={chromeSx} title={dockedMinimized ? 'Restore' : 'Minimize'}>
                {dockedMinimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
              </IconButton>
            )}
            {onUndock && (
              <IconButton size="small" onClick={onUndock} sx={chromeSx} title="Detach to floating window">
                <PictureInPictureAltIcon fontSize="small" />
              </IconButton>
            )}
            {!editing && onPopOut && (
              <IconButton size="small" onClick={onPopOut} sx={chromeSx} title="Open in new window">
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            )}
            {onClose && (
              <IconButton size="small" onClick={onClose} sx={chromeSx} title="Close">
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
        {renderContent(dockedMinimized)}
      </Box>
    );
  }

  if (!open) return null;

  // ========== FLOATING: in-page overlay ==========
  return (
    <Rnd
      size={{ width: windowState.width, height: windowState.height }}
      position={{ x: windowState.x, y: windowState.y }}
      onDragStop={(_e, d) => setWindowState(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        setWindowState({ x: position.x, y: position.y, width: parseInt(ref.style.width), height: parseInt(ref.style.height) });
      }}
      minWidth={300}
      minHeight={minimized ? 48 : 200}
      // "body", not "window" -- see FloatingWindow.tsx's `bounds` comment.
      bounds="body"
      dragHandleClassName="drag-handle"
      cancel={FLOATING_DRAG_CANCEL}
      enableResizing={!minimized}
      style={{ zIndex: 1300 }}
    >
      <Paper elevation={8} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'background.paper', border: 1, borderColor: 'divider' }}>
        {/* ========== TITLE BAR ========== */}
        {/* Uses primary.contrastText (not a hardcoded white) since some named
            themes' primary is light enough that MUI itself picks dark text
            for contrast — see DESIGN.md "Multi-theme compliance". */}
        <Box
          className="drag-handle"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: 'primary.main', color: 'primary.contrastText', cursor: 'move', flexShrink: 0 }}
        >
          <Typography variant="subtitle1" fontWeight="bold">{title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {renderEditControls({ color: 'inherit' })}
            {!editing && onPopOut && (
              <IconButton size="small" onClick={onPopOut} sx={{ color: 'inherit' }} title="Open in new window">
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
            {onClose && (
              <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>

        {/* ========== CONTENT ========== */}
        {renderContent(minimized)}
      </Paper>
    </Rnd>
  );
};

export default MarkdownDocPanel;
