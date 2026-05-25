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
}

/**
 * Force light mode styles on an element and its children for PDF export
 */
const applyLightModeStyles = (element: HTMLElement): void => {
  // Apply white background to the root element
  element.style.backgroundColor = '#ffffff';
  element.style.color = '#000000';

  // Apply to all children with dark backgrounds
  const allElements = element.querySelectorAll('*') as NodeListOf<HTMLElement>;
  allElements.forEach((el) => {
    const computedStyle = window.getComputedStyle(el);
    const bgColor = computedStyle.backgroundColor;
    
    // Check if background is dark (rough heuristic)
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      const rgb = bgColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
        if (brightness < 128) {
          // Dark background - make it light
          el.style.backgroundColor = '#ffffff';
          el.style.color = '#000000';
        }
      }
    }
    
    // Check text color
    const textColor = computedStyle.color;
    if (textColor) {
      const rgb = textColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
        if (brightness > 200) {
          // Light text (likely on dark bg) - make it dark
          el.style.color = '#000000';
        }
      }
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
  } = options;

  try {
    // Clone the element to apply light mode without affecting the original
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.backgroundColor = '#ffffff';
    document.body.appendChild(clone);

    // Apply light mode styles to the clone
    applyLightModeStyles(clone);

    // Collect avoid-break element positions (table rows) so we can cut
    // between rows instead of through them.
    const cloneRect = clone.getBoundingClientRect();
    const avoidEls = clone.querySelectorAll('tr') as NodeListOf<HTMLElement>;
    // We'll compute scaled positions after we know the scale factor
    const avoidElsArr = Array.from(avoidEls);

    try {
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

      // Capture the cloned element with light mode styles
      // Note: Map tiles may not capture due to CORS restrictions
      // html2canvas with useCORS and allowTaint helps but isn't guaranteed
      const canvas = await html2canvas(clone, {
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

      // Build DOM-aware avoid-break ranges in canvas pixels so page cuts
      // never split a table row in the middle.
      const avoidRanges: { top: number; bottom: number }[] = avoidElsArr.map(el => {
        const r = el.getBoundingClientRect();
        return {
          top: (r.top - cloneRect.top) * scale,
          bottom: (r.bottom - cloneRect.top) * scale,
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
    } finally {
      // Clean up the clone
      document.body.removeChild(clone);
    }
  } catch (error) {
    console.error('Failed to export PDF:', error);
    throw error;
  }
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
