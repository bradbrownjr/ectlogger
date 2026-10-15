import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import NetPaperworkPrintView, { PaperworkSection } from '../components/netview/NetPaperworkPrintView';
import { exportElementToPdf } from './pdfExport';

const PRINT_VIEW_ID = 'net-paperwork-print-view';

// Filename-safe form of a label, matching the other exports' convention.
export const pdfFileStem = (text: string): string => text.replace(/[^a-zA-Z0-9]/g, '_');

/**
 * Save one or more of a net's Markdown documents as a PDF.
 *
 * Renders NetPaperworkPrintView into a throwaway off-screen node, captures it,
 * and removes it again, so every caller (each panel's own PDF button, the
 * toolbar's combined Paperwork button, a popped-out window) shares one print
 * layout without mounting a hidden copy of it permanently. Empty sections are
 * dropped; with nothing left, nothing is saved.
 */
export async function exportMarkdownDocsPdf(opts: {
  netName: string;
  label: string;
  sections: PaperworkSection[];
  filename: string;
}): Promise<void> {
  const sections = opts.sections.filter((s) => s.content.trim() !== '');
  if (sections.length === 0) return;

  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', top: '0', left: '-9999px', width: '0', height: '0', overflow: 'hidden' });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(
        <NetPaperworkPrintView id={PRINT_VIEW_ID} netName={opts.netName} label={opts.label} sections={sections} />
      );
    });
    await exportElementToPdf(PRINT_VIEW_ID, { filename: opts.filename });
  } finally {
    root.unmount();
    host.remove();
  }
}
