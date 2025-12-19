/**
 * PDF Export Utility
 * 
 * Uses html2canvas to capture DOM elements and jsPDF to generate PDFs.
 * Can be used for statistics pages, check-in maps, or any other content.
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
}

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

  // Show loading state could be handled by caller
  
  try {
    // Capture the element as a canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true, // Allow cross-origin images (like map tiles)
      allowTaint: true,
      backgroundColor: '#ffffff', // Ensure white background
      logging: false,
    });

    // Calculate dimensions
    const imgWidth = orientation === 'portrait' ? 210 - (margin * 2) : 297 - (margin * 2); // A4 width in mm
    const pageHeight = orientation === 'portrait' ? 297 - (margin * 2) : 210 - (margin * 2); // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    // If content is taller than one page, we need to handle pagination
    let heightLeft = imgHeight;
    let position = margin;
    const imgData = canvas.toDataURL('image/png');

    // Add first page
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
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
