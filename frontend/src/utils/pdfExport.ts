/**
 * PDF Export Utility
 * 
 * Uses html2canvas to capture DOM elements and jsPDF to generate PDFs.
 * Properly clips content at page boundaries to prevent partial repeats.
 *
 * The screen follows the app's theme; only the export is light. A capture
 * copies the element into a hidden frame, recolors the copy for paper, and
 * captures that, so the page the user is looking at never changes color
 * (a dark-mode user is never flashed with a white page). A PDF is laid out
 * in that frame at the width of a US Letter page, so a report exported from
 * a phone is the same document as one exported from a desktop rather than a
 * long, phone-shaped strip.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PRINT_PAGE_WIDTH } from '../components/traffic/print/printStyles';
import { DARK_TILE_LAYER_CLASS } from './mapTiles';

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
  /**
   * DOM capture strategy: clone (default) lays a light-mode copy out at
   * page width; live captures the element exactly as it is on screen.
   */
  captureMode?: 'clone' | 'live';
  /**
   * Running footer drawn on every page: this label on the left (e.g. the
   * net name and date) and "Page X of Y" on the right, so a page separated
   * from the rest of a printed report still says what it belongs to.
   * Reserves a band at the bottom of each page so content never runs under it.
   */
  pageFooter?: string;
}

// Height reserved above the bottom margin for the running footer, in mm.
const PAGE_FOOTER_BAND_MM = 7;

// US Letter, in mm. A4 until 2026-10-04; the clubs using this print on Letter.
const LETTER_MM = { width: 215.9, height: 279.4 };

// CSS px per mm of paper. The form-accurate print views (ICS-309, ICS-213,
// radiogram) are drawn PRINT_PAGE_WIDTH px wide to fill a portrait Letter
// page inside 10 mm margins, so every PDF uses the same density and those
// views keep fitting exactly.
const PAPER_PX_PER_MM = PRINT_PAGE_WIDTH / (LETTER_MM.width - 20);

// Attributes a page can put on its own elements to steer the export copy.
//   data-export-hide          left out of the export (a screen-only control)
//   data-export-show="flex"   hidden on screen (display: none), shown in the
//                             export with this display value
//   data-export-colors='{"#9fb3ea":"#1f3d8f"}'
//                             within this element, a color the screen uses in
//                             place of a print color goes back to the print
//                             color (a report accent lightened for dark mode)
const EXPORT_HIDE_ATTR = 'data-export-hide';
const EXPORT_SHOW_ATTR = 'data-export-show';
const EXPORT_COLORS_ATTR = 'data-export-colors';

// The most a chart is enlarged to fill a wider page (see captureElementAsCanvas)
const CHART_MAX_GROWTH = 1.6;

/**
 * Draw the running footer on every page of a finished PDF. Text is drawn by
 * jsPDF, not captured from the page, so it uses jsPDF's built-in Helvetica.
 */
const drawPageFooters = (
  pdf: jsPDF,
  label: string,
  pageWidth: number,
  pageHeight: number,
  margin: number
): void => {
  const total = pdf.getNumberOfPages();
  const ruleY = pageHeight - margin - PAGE_FOOTER_BAND_MM + 2;
  const textY = ruleY + 4;
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(221, 224, 230);
    pdf.setLineWidth(0.2);
    pdf.line(margin, ruleY, pageWidth - margin, ruleY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(123, 129, 144);
    const pageText = `Page ${page} of ${total}`;
    const labelWidth = pageWidth - margin * 2 - pdf.getTextWidth(pageText) - 6;
    // A very long net name is cut to one line rather than colliding with the page number.
    const fitted = (pdf.splitTextToSize(label, labelWidth) as string[])[0] ?? '';
    const shown = fitted.length < label.length ? `${fitted}...` : fitted;
    pdf.text(shown, margin, textY);
    pdf.text(pageText, pageWidth - margin, textY, { align: 'right' });
  }
};

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

const toHex = ({ r, g, b }: { r: number; g: number; b: number }): string =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const hexOfCssColor = (color: string | null): string | null => {
  if (!color) return null;
  const rgb = parseRgb(color);
  return rgb && rgb.a > 0 ? toHex(rgb) : null;
};

/**
 * Put print colors back wherever a `data-export-colors` map says the screen
 * substituted its own (see the attribute notes above). Covers text, fills,
 * borders, gradients, and SVG fill/stroke, which is how charts draw.
 */
const restorePrintColors = (root: HTMLElement): void => {
  const view = root.ownerDocument.defaultView!;
  const scopes = [root, ...Array.from(root.querySelectorAll(`[${EXPORT_COLORS_ATTR}]`))]
    .filter((el) => el.hasAttribute(EXPORT_COLORS_ATTR)) as HTMLElement[];
  scopes.forEach((scope) => {
    let map: Record<string, string>;
    try {
      map = JSON.parse(scope.getAttribute(EXPORT_COLORS_ATTR) || '{}');
    } catch {
      return;
    }
    const swaps = Object.entries(map).map(([screen, print]) => ({
      screen: screen.toLowerCase(),
      print,
      screenRgb: (() => {
        const n = parseInt(screen.slice(1), 16);
        return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      })(),
    }));
    if (!swaps.length) return;
    const elements = [scope, ...Array.from(scope.querySelectorAll('*'))] as (HTMLElement | SVGElement)[];
    elements.forEach((el) => {
      const cs = view.getComputedStyle(el);
      swaps.forEach(({ screen, print, screenRgb }) => {
        if (hexOfCssColor(cs.color) === screen) el.style.color = print;
        if (hexOfCssColor(cs.backgroundColor) === screen) el.style.backgroundColor = print;
        (['Top', 'Right', 'Bottom', 'Left'] as const).forEach((side) => {
          if (hexOfCssColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)) === screen) {
            el.style.setProperty(`border-${side.toLowerCase()}-color`, print);
          }
        });
        if (cs.backgroundImage.includes(screenRgb)) {
          el.style.backgroundImage = cs.backgroundImage.split(screenRgb).join(print);
        }
        if (el instanceof view.SVGElement) {
          (['fill', 'stroke', 'stop-color'] as const).forEach((prop) => {
            if (hexOfCssColor(cs.getPropertyValue(prop)) === screen) {
              el.setAttribute(prop, print);
              el.style.setProperty(prop, print);
            }
          });
        }
      });
    });
  });
};

/**
 * Recolor an export copy for paper. Only grey dark backgrounds (theme
 * surfaces) are repainted; colored backgrounds and the light text sitting on
 * them are preserved. Dark mode's translucent white rules and secondary text
 * become their light-mode greys rather than vanishing or going full black.
 */
const applyLightModeStyles = (element: HTMLElement): void => {
  const view = element.ownerDocument.defaultView!;

  // Dark-mode map tiles are darkened with a CSS filter class; paper gets the
  // plain tiles underneath.
  element.querySelectorAll(`.${DARK_TILE_LAYER_CLASS}`).forEach((el) => el.classList.remove(DARK_TILE_LAYER_CLASS));

  restorePrintColors(element);

  // html2canvas loses the text of an MUI Chip (an inline-flex box around a
  // clipped label): the percentages on the schedule report's leaderboard came
  // out as blank pills. Laid out as a plain inline-block pill, the way
  // NetReport's StatusBadge already is, the text survives.
  element.querySelectorAll('.MuiChip-root').forEach((el) => {
    const chip = el as HTMLElement;
    const height = view.getComputedStyle(chip).height;
    Object.assign(chip.style, { display: 'inline-block', lineHeight: height, verticalAlign: 'middle', whiteSpace: 'nowrap' });
  });
  element.querySelectorAll('.MuiChip-label').forEach((el) => {
    Object.assign((el as HTMLElement).style, { display: 'inline', overflow: 'visible', textOverflow: 'clip' });
  });

  // Apply white background to the root element
  element.style.backgroundColor = '#ffffff';
  element.style.color = '#000000';

  const allElements = element.querySelectorAll('*') as NodeListOf<HTMLElement>;

  // Pass 1: backgrounds and rules. Read every computed style before writing
  // any, so a repainted parent never changes what a child reports.
  const styles = Array.from(allElements, (el) => view.getComputedStyle(el));
  const textColors = styles.map((s) => s.color);
  const borderColors = styles.map((s) =>
    (['top', 'right', 'bottom', 'left'] as const).map((side) => s.getPropertyValue(`border-${side}-color`))
  );
  allElements.forEach((el, i) => {
    const bg = parseRgb(styles[i].backgroundColor);
    if (bg && bg.a > 0) {
      const chroma = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
      if (chroma >= COLORED_SURFACE_MIN_CHROMA && bg.a >= 0.5) {
        el.setAttribute(COLORED_SURFACE_ATTR, '');
      } else if (brightnessOf(bg) < 128) {
        // Dark grey theme surface - make it light
        el.style.backgroundColor = '#ffffff';
        el.style.color = '#000000';
      } else if (bg.a < 1 && bg.a >= 0.1 && brightnessOf(bg) > 200) {
        // Dark mode's translucent white fill (a divider line, a plain chip)
        // would be white on white
        el.style.backgroundColor = '#e0e0e0';
      }
    }
    (['top', 'right', 'bottom', 'left'] as const).forEach((side, s) => {
      const border = parseRgb(borderColors[i][s]);
      if (border && border.a > 0 && border.a < 1 && brightnessOf(border) > 200) {
        el.style.setProperty(`border-${side}-color`, '#e0e0e0');
      }
    });
  });

  // Pass 2: light text (dark-mode body text) becomes dark, unless it sits
  // on a preserved colored surface, e.g. white text on a status badge.
  // Dark mode's dimmed secondary text becomes light mode's grey.
  allElements.forEach((el, i) => {
    const text = parseRgb(textColors[i]);
    if (text && brightnessOf(text) > 200 && !el.closest(`[${COLORED_SURFACE_ATTR}]`)) {
      el.style.color = text.a < 0.85 ? '#555555' : '#000000';
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

const html2canvasOptions = (scale: number) => ({
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

/**
 * A hidden, same-origin frame `width` CSS px wide carrying a copy of every
 * stylesheet in the page. The width is the frame's viewport, so the page's
 * own breakpoints lay a copy out for that width (a phone exporting a report
 * gets the same layout as a desktop), not for the phone's screen.
 */
const createExportFrame = async (width: number): Promise<HTMLIFrameElement> => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: 'fixed', left: '-100000px', top: '0', width: `${width}px`, height: '100px', border: '0',
  });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#ffffff"></body></html>');
  doc.close();

  const loads: Promise<unknown>[] = [];
  const rules: string[] = [];
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      // MUI's styles live only in the CSSOM (no text in their <style> tags)
      rules.push(Array.from(sheet.cssRules, (r) => r.cssText).join('\n'));
    } catch {
      // A cross-origin sheet (web fonts) can't be read; link it instead
      if (!sheet.href) return;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      loads.push(new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; }));
      doc.head.appendChild(link);
    }
  });
  const style = doc.createElement('style');
  style.textContent = rules.join('\n');
  doc.head.appendChild(style);
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 3000))]);
  return frame;
};

/**
 * A Leaflet map can't re-lay itself out in a copy: its tiles are positioned
 * for the size it has on screen. When the copy is a different width, each
 * map is captured as it stands and replaced by that picture, at its own size
 * or narrower to fit the page. Returns the pictures in document order (null
 * where a map couldn't be captured, which then stays as it was).
 */
const captureMaps = async (element: HTMLElement, scale: number): Promise<(string | null)[]> =>
  Promise.all(
    Array.from(element.querySelectorAll('.leaflet-container'), async (map) => {
      try {
        const canvas = await html2canvas(map as HTMLElement, {
          ...html2canvasOptions(scale),
          onclone: (_doc, el) => {
            el.querySelectorAll(`.${DARK_TILE_LAYER_CLASS}`).forEach((t) => t.classList.remove(DARK_TILE_LAYER_CLASS));
            el.querySelectorAll('.leaflet-control-zoom').forEach((z) => ((z as HTMLElement).style.display = 'none'));
          },
        });
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    })
  );

interface CapturedElement {
  canvas: HTMLCanvasElement;
  /** Vertical extents (canvas px) of rows and other blocks a page cut must not split. */
  avoidRanges: { top: number; bottom: number }[];
}

// Rows, plus anything a caller opts in with data-pdf-avoid-break (e.g. a map
// card that would otherwise render as two useless half-images).
const measureAvoidRanges = (root: HTMLElement, pxScale: number) => {
  const rootTop = root.getBoundingClientRect().top;
  return Array.from(root.querySelectorAll('tr, [data-pdf-avoid-break]'), (el) => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - rootTop) * pxScale, bottom: (r.bottom - rootTop) * pxScale };
  });
};

/**
 * Capture a DOM element to a canvas. Shared by exportToPdf and exportToPng so
 * there is exactly one place that knows how to deal with canvas-cloning
 * (Leaflet maps) and CORS-tainted tiles.
 *
 * clone (default): copy the element into an export frame `layoutWidth` px
 * wide (the element's own width when not given), recolor the copy for paper
 * and capture it. Nothing on screen changes. live: capture the element as it
 * is on screen.
 */
const captureElementAsCanvas = async (
  element: HTMLElement,
  scale: number,
  captureMode: 'clone' | 'live' = 'clone',
  layoutWidth?: number
): Promise<CapturedElement> => {
  if (captureMode === 'live') {
    const canvas = await html2canvas(element, html2canvasOptions(scale));
    return { canvas, avoidRanges: measureAvoidRanges(element, scale) };
  }

  const width = Math.round(layoutWidth ?? element.offsetWidth);
  const mapImages = width !== element.offsetWidth ? await captureMaps(element, scale) : [];
  const frame = await createExportFrame(width);
  try {
    const doc = frame.contentDocument!;
    const clone = doc.importNode(element, true) as HTMLElement;
    clone.removeAttribute('id');
    clone.style.width = '100%';
    clone.style.boxSizing = 'border-box';
    clone.style.margin = '0';
    doc.body.appendChild(clone);

    // A copied <canvas> starts blank: cloning copies its attributes, never
    // its drawn pixels. Both trees list canvases in the same order, so pair
    // them by index (before any map below is swapped out).
    const originalCanvases = element.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((target, i) => {
      const source = originalCanvases[i];
      const ctx = target.getContext('2d');
      if (source && ctx && source.width && source.height) ctx.drawImage(source, 0, 0);
    });

    // Maps captured above, swapped in as pictures (see captureMaps)
    const originalMaps = element.querySelectorAll('.leaflet-container');
    clone.querySelectorAll('.leaflet-container').forEach((map, i) => {
      const src = mapImages[i];
      if (!src) return;
      const img = doc.createElement('img');
      img.src = src;
      img.alt = '';
      Object.assign(img.style, {
        display: 'block', width: `${(originalMaps[i] as HTMLElement).offsetWidth}px`,
        maxWidth: '100%', height: 'auto', margin: '0 auto',
      });
      const holder = map.parentElement;
      map.replaceWith(img);
      // The map's box was sized for the map; let it fit the picture instead
      if (holder && holder !== clone) holder.style.height = 'auto';
    });

    // A chart is drawn at the pixel size it had on screen. In a wider copy,
    // grow it to the width it now has, up to CHART_MAX_GROWTH so a phone's
    // chart doesn't turn into a poster; a narrower copy shrinks it to fit.
    // Its SVG keeps its viewBox, so setting the size scales the drawing.
    if (width !== element.offsetWidth) {
      clone.querySelectorAll('.recharts-wrapper').forEach((node) => {
        const wrapper = node as HTMLElement;
        const svg = wrapper.querySelector(':scope > svg');
        const w = wrapper.offsetWidth, h = wrapper.offsetHeight;
        const holder = wrapper.parentElement;
        if (!svg || !holder || !w || !h || wrapper.querySelector('.recharts-legend-wrapper')) return;
        const factor = Math.min(holder.clientWidth / w, CHART_MAX_GROWTH);
        // Recharts caps the wrapper at its screen size with max-width/max-height
        Object.assign(wrapper.style, { width: `${w * factor}px`, height: `${h * factor}px`, maxWidth: 'none', maxHeight: 'none', margin: '0 auto' });
        // Without a viewBox a resized SVG only gets a bigger canvas, not a bigger drawing
        if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('width', String(w * factor));
        svg.setAttribute('height', String(h * factor));
        if (holder.classList.contains('recharts-responsive-container')) holder.style.height = `${h * factor}px`;
      });
    }

    // Map zoom buttons are screen controls, not content; leave them out of
    // every PDF and image. The attribution control stays (OSM requires it).
    clone.querySelectorAll('.leaflet-control-zoom').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    clone.querySelectorAll(`[${EXPORT_HIDE_ATTR}]`).forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    clone.querySelectorAll(`[${EXPORT_SHOW_ATTR}]`).forEach((el) => {
      (el as HTMLElement).style.display = el.getAttribute(EXPORT_SHOW_ATTR) || 'block';
    });

    applyLightModeStyles(clone);

    // Let the copy's images and fonts finish before measuring or capturing
    await Promise.all(Array.from(clone.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)));
    await doc.fonts?.ready;
    frame.style.height = `${Math.ceil(clone.getBoundingClientRect().height)}px`;

    const canvas = await html2canvas(clone, html2canvasOptions(scale));
    return { canvas, avoidRanges: measureAvoidRanges(clone, canvas.width / clone.offsetWidth) };
  } finally {
    frame.remove();
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
    pageFooter,
  } = options;

  try {
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'letter',
    });

    const pageWidth = orientation === 'portrait' ? LETTER_MM.width : LETTER_MM.height;
    const pageHeight = orientation === 'portrait' ? LETTER_MM.height : LETTER_MM.width;
    const contentWidth = pageWidth - (margin * 2);
    const contentHeight = pageHeight - (margin * 2) - (pageFooter ? PAGE_FOOTER_BAND_MM : 0);

    // Lay the copy out at the page's own width, so text prints at a
    // readable size and the PDF is the same from any screen
    const { canvas, avoidRanges } = await captureElementAsCanvas(
      element, scale, captureMode, contentWidth * PAPER_PX_PER_MM
    );

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
    // A last slice of a few pixels is only bottom padding and a card's
    // closing border; don't spend a page on it
    if (boundaries.length > 2 && boundaries[boundaries.length - 1] - boundaries[boundaries.length - 2] < pageHeightPx * 0.03) {
      boundaries.pop();
    }

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

    if (pageFooter) {
      drawPageFooters(pdf, pageFooter, pageWidth, pageHeight, margin);
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
  /** DOM capture strategy: clone (default, light mode at the element's width) or live element */
  captureMode?: 'clone' | 'live';
  /** Cut away empty white margins and leave an even border (social images). */
  trim?: boolean;
}

// Anything lighter than this in every channel counts as page background.
const TRIM_WHITE_THRESHOLD = 245;

/**
 * Crop a canvas to its non-white content plus an even `pad` on every side.
 * Returns the source untouched if it can't be read (a canvas tainted by a
 * cross-origin image) or is entirely white.
 */
const trimWhitespace = (source: HTMLCanvasElement, pad: number): HTMLCanvasElement => {
  let data: Uint8ClampedArray;
  try {
    data = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
  } catch {
    return source;
  }
  const { width, height } = source;
  let top = height, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < TRIM_WHITE_THRESHOLD || data[i + 1] < TRIM_WHITE_THRESHOLD || data[i + 2] < TRIM_WHITE_THRESHOLD) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return source;
  const out = document.createElement('canvas');
  out.width = right - left + 1 + pad * 2;
  out.height = bottom - top + 1 + pad * 2;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, left, top, right - left + 1, bottom - top + 1, pad, pad, right - left + 1, bottom - top + 1);
  return out;
};

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
    trim = false,
  } = options;

  try {
    const { canvas: captured } = await captureElementAsCanvas(element, scale, captureMode);
    const canvas = withAttributionFooter(trim ? trimWhitespace(captured, 28 * scale) : captured, scale);

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
