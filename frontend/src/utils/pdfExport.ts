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
 * Extract a specific page slice from a canvas
 */
const getPageSlice = (
  sourceCanvas: HTMLCanvasElement,
  pageIndex: number,
  pageHeightPx: number
): HTMLCanvasElement => {
  const sliceCanvas = document.createElement('canvas');
  const ctx = sliceCanvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Calculate the source Y position and height for this page
  const sourceY = pageIndex * pageHeightPx;
  const sourceHeight = Math.min(pageHeightPx, sourceCanvas.height - sourceY);
  
  // Set the slice canvas size
  sliceCanvas.width = sourceCanvas.width;
  sliceCanvas.height = sourceHeight;

  // Fill with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

  // Draw only the portion of the source canvas that belongs on this page
  ctx.drawImage(
    sourceCanvas,
    0, sourceY,                          // Source x, y
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
      const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // Calculate dimensions
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;
      
      // Calculate how the image will fit on the page (in mm)
      const imgWidthMm = contentWidth;
      const imgHeightMm = (imgHeightPx * contentWidth) / imgWidthPx;
      
      // Calculate page height in pixels (at the scale we captured)
      const pageHeightPx = (contentHeight / imgHeightMm) * imgHeightPx;
      
      // Calculate how many pages we need
      const totalPages = Math.ceil(imgHeightPx / pageHeightPx);

      // Generate each page by slicing the canvas
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Extract just this page's portion of the canvas
        const pageCanvas = getPageSlice(canvas, page, pageHeightPx);
        const pageImgData = pageCanvas.toDataURL('image/png');
        
        // Calculate the height for this page slice (may be shorter on last page)
        const sliceHeightMm = (pageCanvas.height / imgHeightPx) * imgHeightMm;

        // Add the slice to the PDF at the top margin
        pdf.addImage(pageImgData, 'PNG', margin, margin, contentWidth, sliceHeightMm);
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
