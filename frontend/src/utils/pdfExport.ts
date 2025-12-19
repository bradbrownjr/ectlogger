/**
 * PDF Export Utility
 * 
 * Uses html2canvas to capture DOM elements and jsPDF to generate PDFs.
 * Can be used for statistics pages, check-in maps, or any other content.
 * Supports page breaks via CSS pageBreakBefore property.
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
    usePageBreaks = false,
  } = options;

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

    if (usePageBreaks) {
      // Find sections with page breaks
      const sections: HTMLElement[] = [];
      
      // First section: everything before the first page break
      // Find all direct children that have pageBreakBefore style
      const children = Array.from(element.children) as HTMLElement[];
      let currentSection: HTMLElement[] = [];
      
      for (const child of children) {
        const style = window.getComputedStyle(child);
        if (style.pageBreakBefore === 'always' || style.breakBefore === 'page') {
          // Save current section if it has content
          if (currentSection.length > 0) {
            const wrapper = document.createElement('div');
            wrapper.style.backgroundColor = '#ffffff';
            currentSection.forEach(el => wrapper.appendChild(el.cloneNode(true)));
            sections.push(wrapper);
          }
          currentSection = [child];
        } else {
          currentSection.push(child);
        }
      }
      
      // Don't forget the last section
      if (currentSection.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.style.backgroundColor = '#ffffff';
        currentSection.forEach(el => wrapper.appendChild(el.cloneNode(true)));
        sections.push(wrapper);
      }

      // Render each section as a separate page
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        
        // Temporarily add to DOM for rendering
        section.style.position = 'absolute';
        section.style.left = '-9999px';
        section.style.width = `${element.offsetWidth}px`;
        document.body.appendChild(section);

        try {
          const canvas = await html2canvas(section, {
            scale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
          });

          const imgWidth = contentWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const imgData = canvas.toDataURL('image/png');

          if (i > 0) {
            pdf.addPage();
          }

          // If section is taller than page, handle pagination within section
          let heightLeft = imgHeight;
          let position = margin;

          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= contentHeight;

          while (heightLeft > 0) {
            position = heightLeft - imgHeight + margin;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= contentHeight;
          }
        } finally {
          document.body.removeChild(section);
        }
      }
    } else {
      // Original behavior: capture entire element
      const canvas = await html2canvas(element, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/png');

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= contentHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= contentHeight;
      }
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
