import React from 'react';
import { netApi, templateApi } from '../services/api';
import MarkdownDocPanel from './shared/MarkdownDocPanel';

// ========== NET SCRIPT ==========
// A net's script, copied from its schedule when the net is created. All of
// the panel itself (floating, docked, popped out, editing, PDF) is
// MarkdownDocPanel.
//
// The pencil saves to both this net and its schedule. It has saved to the
// schedule since it was added, so future nets get the change; until
// 2026-10-15 it saved ONLY there, while the panel shows the net's own copy,
// so the edit vanished from this net on the next reload.

interface NetScriptProps {
  open: boolean;
  onClose?: () => void;
  script: string;
  netName: string;
  netId: number;
  templateId?: number;
  canEdit?: boolean;
  onSaved?: (newScript: string) => void;
  embedded?: boolean;
  onUndock?: () => void;
  onDock?: () => void;
  onPopOut?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const NetScript: React.FC<NetScriptProps> = ({ script, netId, templateId, canEdit = false, onSaved, ...panel }) => (
  <MarkdownDocPanel
    {...panel}
    title="Net Script"
    content={script}
    emptyText="No script defined for this net."
    look="bordered"
    allowHighlight
    // Saved against the schedule, so a net with no schedule has nowhere to save it.
    canEdit={canEdit && !!templateId}
    editTooltip="Edit script"
    draftKey={templateId ? `net-script:${templateId}` : null}
    onSave={async (text) => {
      if (!templateId) return;
      await templateApi.update(templateId, { script: text });
      await netApi.update(netId, { script: text });
      onSaved?.(text);
    }}
  />
);

export default NetScript;
