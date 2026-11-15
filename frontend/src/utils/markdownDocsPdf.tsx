import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import NetDocPrintView, { DocNet } from '../components/netview/NetDocPrintView';
import { exportElementToPdf } from './pdfExport';

export type { DocNet };

const PRINT_VIEW_ID = 'net-doc-print-view';

// Filename-safe form of a label, matching the other exports' convention.
export const pdfFileStem = (text: string): string => text.replace(/[^a-zA-Z0-9]/g, '_');

/**
 * Where a reader gets the latest copy of a net document. Announcements
 * belong to the schedule, so they point at the schedule's page, whose
 * address never changes; the script and notes point at the net.
 */
export const docLatestCopyUrl = (net: DocNet, title: string): string =>
  title === 'Announcements' && net.template_id
    ? `${window.location.origin}/scheduler/${net.template_id}`
    : `${window.location.origin}/nets/${net.id}`;

/**
 * Save one of a net's Markdown documents (script, announcements, notes) as
 * a PDF.
 *
 * Renders NetDocPrintView into a throwaway off-screen node, captures it, and
 * removes it again, so every caller (each panel's own PDF button, the
 * Reports menu, a popped-out window) shares one print layout without
 * mounting a hidden copy of it permanently. An empty document saves nothing.
 */
export async function exportNetDocPdf(opts: {
  net: DocNet;
  title: string;
  content: string;
  preferUtc: boolean;
}): Promise<void> {
  const { net, title, content, preferUtc } = opts;
  if (!content.trim()) return;

  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', top: '0', left: '-9999px', width: '0', height: '0', overflow: 'hidden' });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(
        <NetDocPrintView
          id={PRINT_VIEW_ID}
          net={net}
          title={title}
          content={content}
          latestCopyUrl={docLatestCopyUrl(net, title)}
          preferUtc={preferUtc}
        />
      );
    });
    await exportElementToPdf(PRINT_VIEW_ID, {
      filename: `${pdfFileStem(net.name)}_${pdfFileStem(title)}`,
      orientation: 'portrait',
      // Every page names the net and the document, with "Page X of Y"
      pageFooter: `${net.name} · ${title}`,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
