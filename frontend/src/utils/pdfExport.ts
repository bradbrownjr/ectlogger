/**
 * PDF Export Utility
 * 
 * Uses html2canvas to capture DOM elements and jsPDF to generate PDFs.
 * Properly clips content at page boundaries to prevent partial repeats.
 * Forces light mode styling for print-friendly output.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  /** Filename without extension */
  filename: string;
  /** Page orientation */
  orientation?: 'portrait' | 'landscape';
  /** Add timestamp to filename */
  addTimestamp?: boolean;
  /** Scale factor for better quality (default: 2) */
  scale?: number;
  /** Page margins in mm */
  margin?: number;
  /** Use page breaks (sections with pageBreakBefore style become separate pages) */
  usePageBreaks?: boolean;
  /** DOM capture strategy: clone (default) or live element */
  captureMode?: 'clone' | 'live';
}

/**
 * Parse a computed CSS color ("rgb(r, g, b)" / "rgba(r, g, b, a)") into its
 * channels, or null for anything else (e.g. "transparent").
 */
const parseRgb = (color: string): { r: number; g: number; b: number; a: number } | null => {
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  return {
    r: parseFloat(parts[0]),
    g: parseFloat(parts[1]),
    b: parseFloat(parts[2]),
    a: parts.length >= 4 ? parseFloat(parts[3]) : 1,
  };
};

const brightnessOf = ({ r, g, b }: { r: number; g: number; b: number }): number =>
  (r * 299 + g * 587 + b * 114) / 1000;

// Chroma (max channel minus min channel) above this means the color is an
// intentional hue -- a status badge, a role color -- rather than a dark-mode
// theme surface, which is always grey (#121212, #1e1e1e, elevation overlays).
// Brightness alone cannot tell the two apart: the "Listening Only" purple
// (#9c27b0) is darker than 128, so it was whitened out of every export while
// the green "Checked In" badge survived only by scoring 135.
const COLORED_SURFACE_MIN_CHROMA = 40;

// Marks, on the throwaway clone only, an element whose background is kept as
// a deliberate color, so light text on top of it is left alone too.
const COLORED_SURFACE_ATTR = 'data-export-colored-surface';

/**
 * Force light mode styles on an element and its children for PDF export.
 * Only grey dark backgrounds (theme surfaces) are repainted; colored
 * backgrounds and the light text sitting on them are preserved.
 */
const applyLightModeStyles = (element: HTMLElement): void => {
  // Apply white background to the root element
  element.style.backgroundColor = '#ffffff';
  element.style.color = '#000000';

  const allElements = element.querySelectorAll('*') as NodeListOf<HTMLElement>;

  // Pass 1: backgrounds. Read every computed style before writing any, so a
  // repainted parent never changes what a child reports.
  const styles = Array.from(allElements, (el) => window.getComputedStyle(el));
  const textColors = styles.map((s) => s.color);
  allElements.forEach((el, i) => {
    const bg = parseRgb(styles[i].backgroundColor);
    if (!bg || bg.a === 0) return;
    const chroma = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
    if (chroma >= COLORED_SURFACE_MIN_CHROMA && bg.a >= 0.5) {
      el.setAttribute(COLORED_SURFACE_ATTR, '');
    } else if (brightnessOf(bg) < 128) {
      // Dark grey theme surface - make it light
      el.style.backgroundColor = '#ffffff';
      el.style.color = '#000000';
    }
  });

  // Pass 2: light text (dark-mode body text) becomes dark, unless it sits
  // on a preserved colored surface, e.g. white text on a status badge.
  allElements.forEach((el, i) => {
    const text = parseRgb(textColors[i]);
    if (text && brightnessOf(text) > 200 && !el.closest(`[${COLORED_SURFACE_ATTR}]`)) {
      el.style.color = '#000000';
    }
  });
};

/**
 * Compute page cut boundaries that avoid splitting elements marked with
 * break-avoid (e.g. table rows).  Instead of cutting at a fixed interval,
 * we scan upward from the natural cut point until we find a gap between
 * two avoid-break elements.
 *
 * @param totalHeight  Total canvas height in px
 * @param pageHeight   Natural page height in px
 * @param avoidRanges  Elements whose interior must not be cut
 * @returns Array of Y cut positions: [0, cut1, cut2, ..., totalHeight]
 */
const computeSmartBoundaries = (
  totalHeight: number,
  pageHeight: number,
  avoidRanges: { top: number; bottom: number }[]
): number[] => {
  const cuts: number[] = [0];
  let cursor = 0;
  while (cursor < totalHeight) {
    let cutEnd = Math.min(cursor + pageHeight, totalHeight);
    // Walk up from the natural cut to find a gap between avoid-break elements
    let adjusted = true;
    let safety = 0;
    while (adjusted && safety < avoidRanges.length + 1) {
      adjusted = false;
      safety++;
      for (const range of avoidRanges) {
        if (range.top >= cursor && range.top < cutEnd && range.bottom > cutEnd) {
          // The cut would slice through this element; move cut to just before it
          cutEnd = Math.max(cursor + 1, range.top);
          adjusted = true;
          break;
        }
      }
    }
    cuts.push(cutEnd);
    cursor = cutEnd;
  }
  return cuts;
};

/**
 * Extract an arbitrary vertical slice from a canvas (not necessarily page-sized)
 */
const getCanvasSlice = (
  sourceCanvas: HTMLCanvasElement,
  sliceTop: number,
  sliceHeight: number
): HTMLCanvasElement => {
  const sliceCanvas = document.createElement('canvas');
  const ctx = sliceCanvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Calculate the source Y position and height for this slice
  const sourceHeight = Math.min(sliceHeight, sourceCanvas.height - sliceTop);
  
  // Set the slice canvas size
  sliceCanvas.width = sourceCanvas.width;
  sliceCanvas.height = sourceHeight;

  // Fill with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

  // Draw only the portion of the source canvas that belongs on this slice
  ctx.drawImage(
    sourceCanvas,
    0, sliceTop,                         // Source x, y
    sourceCanvas.width, sourceHeight,    // Source width, height
    0, 0,                                // Destination x, y
    sourceCanvas.width, sourceHeight     // Destination width, height
  );

  return sliceCanvas;
};

/**
 * Capture a DOM element to a canvas, forcing light-mode styling on an
 * off-screen clone (default) so a dark-theme UI still exports print/social
 * friendly. Shared by exportToPdf and exportElementToPng so there is exactly
 * one place that knows how to deal with canvas-cloning (Leaflet maps) and
 * CORS-tainted tiles.
 */
const captureElementAsCanvas = async (
  element: HTMLElement,
  scale: number,
  captureMode: 'clone' | 'live' = 'clone'
): Promise<HTMLCanvasElement> => {
  let captureElement: HTMLElement = element;
  let clone: HTMLElement | null = null;

  // Default strategy uses an off-screen clone so we can force light mode
  // without mutating the on-screen UI.
  if (captureMode === 'clone') {
    clone = element.cloneNode(true) as HTMLElement;

    // cloneNode() copies a <canvas> element's attributes but never its
    // drawn pixel content -- the clone starts blank. Anything rendered to
    // canvas (e.g. a Leaflet map using preferCanvas for its vector layer)
    // would otherwise capture as empty. Canvases appear in the same
    // document order in both trees, so pairing by index is reliable.
    const originalCanvases = element.querySelectorAll('canvas');
    const clonedCanvases = clone.querySelectorAll('canvas');
    originalCanvases.forEach((sourceCanvas, i) => {
      const targetCanvas = clonedCanvases[i];
      const ctx = targetCanvas?.getContext('2d');
      if (ctx) ctx.drawImage(sourceCanvas, 0, 0);
    });

    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.backgroundColor = '#ffffff';
    document.body.appendChild(clone);

    // Apply light mode styles to the clone
    applyLightModeStyles(clone);
    captureElement = clone;
  }

  try {
    // Note: Map tiles may not capture due to CORS restrictions
    // html2canvas with useCORS and allowTaint helps but isn't guaranteed
    return await html2canvas(captureElement, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Wait for images to load
      imageTimeout: 5000,
      // Capture even problematic cross-origin content
      foreignObjectRendering: false,
      // Remove proxies - direct capture
      removeContainer: true,
    });
  } finally {
    if (clone) {
      document.body.removeChild(clone);
    }
  }
};

/**
 * Export a DOM element to PDF
 *
 * @param element - The DOM element to capture
 * @param options - Export options
 */
export const exportToPdf = async (
  element: HTMLElement,
  options: PdfExportOptions
): Promise<void> => {
  const {
    filename,
    orientation = 'portrait',
    addTimestamp = true,
    scale = 2,
    margin = 10,
    captureMode = 'clone',
  } = options;

  try {
    // Collect avoid-break element positions (table rows, plus anything a
    // caller opts in with data-pdf-avoid-break, e.g. a map card that would
    // otherwise render as two useless half-images if a page cut landed
    // inside it) so we can cut between them instead of through them.
    // Measured against the live element -- geometry is identical on the
    // clone since it's a same-width off-screen copy.
    const captureRect = element.getBoundingClientRect();
    const avoidEls = element.querySelectorAll('tr, [data-pdf-avoid-break]') as NodeListOf<HTMLElement>;
    const avoidElsArr = Array.from(avoidEls);

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = orientation === 'portrait' ? 210 : 297;
    const pageHeight = orientation === 'portrait' ? 297 : 210;
    const contentWidth = pageWidth - (margin * 2);
    const contentHeight = pageHeight - (margin * 2);

    const canvas = await captureElementAsCanvas(element, scale, captureMode);

    // Build DOM-aware avoid-break ranges in canvas pixels so page cuts
    // never split a table row in the middle.
    const avoidRanges: { top: number; bottom: number }[] = avoidElsArr.map(el => {
      const r = el.getBoundingClientRect();
      return {
        top: (r.top - captureRect.top) * scale,
        bottom: (r.bottom - captureRect.top) * scale,
      };
    });

    // Calculate dimensions
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;

    // Calculate how the image will fit on the page (in mm)
    void contentWidth; // imgWidthMm unused but kept for reference
    const imgHeightMm = (imgHeightPx * contentWidth) / imgWidthPx;

    // Calculate page height in pixels (at the scale we captured)
    const pageHeightPx = (contentHeight / imgHeightMm) * imgHeightPx;

    // Compute smart cut boundaries that avoid splitting table rows
    const boundaries = computeSmartBoundaries(imgHeightPx, pageHeightPx, avoidRanges);

    // Generate each page from the smart slice boundaries
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (i > 0) {
        pdf.addPage();
      }

      const sliceTop = boundaries[i];
      const sliceHeight = boundaries[i + 1] - sliceTop;

      // Extract just this page's portion of the canvas
      const pageCanvas = getCanvasSlice(canvas, sliceTop, sliceHeight);
      // Use JPEG (0.85 quality) — dramatically smaller than PNG with minimal
      // visible quality loss for text/table content (~70-80% size reduction).
      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.85);

      // Calculate the height for this page slice (may be shorter on last page)
      const sliceHeightMm = (pageCanvas.height / imgHeightPx) * imgHeightMm;

      // Add the slice to the PDF at the top margin
      pdf.addImage(pageImgData, 'JPEG', margin, margin, contentWidth, sliceHeightMm);
    }

    // Generate filename
    let finalFilename = filename;
    if (addTimestamp) {
      const timestamp = new Date().toISOString().split('T')[0];
      finalFilename = `${filename}_${timestamp}`;
    }

    // Save the PDF
    pdf.save(`${finalFilename}.pdf`);
  } catch (error) {
    console.error('Failed to export PDF:', error);
    throw error;
  }
};

export interface PngExportOptions {
  /** Filename without extension */
  filename: string;
  /** Add timestamp to filename */
  addTimestamp?: boolean;
  /** Scale factor for better quality (default: 2) */
  scale?: number;
  /** DOM capture strategy: clone (default, forces light mode) or live element */
  captureMode?: 'clone' | 'live';
}

/**
 * Return a copy of the canvas with a small attribution footer appended:
 * "Created with ECTLogger" plus the address of the instance it came from.
 * PNG exports are meant to be shared (e.g. posted to Facebook), so the image
 * itself says where it came from. window.location.host rather than a fixed
 * URL, so a self-hosted instance credits its own address.
 */
const withAttributionFooter = (source: HTMLCanvasElement, scale: number): HTMLCanvasElement => {
  const footerHeight = 32 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height + footerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);

  // Hairline divider between the content and the footer
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, source.height, canvas.width, Math.max(1, scale));

  ctx.fillStyle = '#757575';
  ctx.font = `${12 * scale}px ${window.getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Created with ECTLogger \u00b7 ${window.location.host}`,
    canvas.width / 2,
    source.height + footerHeight / 2
  );

  return canvas;
};

/**
 * Export a DOM element to a single PNG image (e.g. a report section for a
 * social media post) -- same clone/light-mode/canvas-copy capture as
 * exportToPdf, minus the page-splitting.
 */
export const exportToPng = async (
  element: HTMLElement,
  options: PngExportOptions
): Promise<void> => {
  const {
    filename,
    addTimestamp = true,
    scale = 2,
    captureMode = 'clone',
  } = options;

  try {
    const canvas = withAttributionFooter(
      await captureElementAsCanvas(element, scale, captureMode),
      scale
    );

    let finalFilename = filename;
    if (addTimestamp) {
      const timestamp = new Date().toISOString().split('T')[0];
      finalFilename = `${filename}_${timestamp}`;
    }

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('Failed to encode PNG');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${finalFilename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export PNG:', error);
    throw error;
  }
};

/**
 * Export a DOM element by ID to PNG
 *
 * @param elementId - The ID of the element to capture
 * @param options - Export options
 */
export const exportElementToPng = async (
  elementId: string,
  options: PngExportOptions
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }
  return exportToPng(element, options);
};

/**
 * Export a DOM element by ID to PDF
 * 
 * @param elementId - The ID of the element to capture
 * @param options - Export options
 */
export const exportElementToPdf = async (
  elementId: string,
  options: PdfExportOptions
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }
  return exportToPdf(element, options);
};
