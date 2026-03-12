/**
 * Native PDF Export for Net Reports
 * 
 * Builds the PDF using native jsPDF text and jspdf-autotable for tables,
 * keeping file size small. Only maps and charts are captured as compressed
 * JPEG images via html2canvas.
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

// ========== INTERFACES ==========

interface Frequency {
  id: number;
  frequency?: string;
  mode: string;
  network?: string;
  talkgroup?: string;
  description?: string;
}

interface Net {
  id: number;
  name: string;
  description: string;
  status: string;
  ics309_enabled?: boolean;
  frequencies: Frequency[];
  started_at?: string;
  closed_at?: string;
}

interface CheckIn {
  id: number;
  callsign: string;
  name: string;
  location: string;
  status: string;
  is_recheck: boolean;
  checked_in_at: string;
  frequency_id?: number;
  notes?: string;
  relayed_by?: string;
}

interface NetStats {
  net_id: number;
  net_name: string;
  status: string;
  total_check_ins: number;
  unique_callsigns: number;
  rechecks: number;
  duration_minutes: number | null;
  started_at: string | null;
  closed_at: string | null;
  status_counts: Record<string, number>;
  check_ins_by_frequency: Record<string, number>;
  top_operators: { callsign: string; check_in_count: number; first_check_in: string }[];
}

interface ChatMessage {
  id: number;
  message: string;
  callsign?: string;
  is_system: boolean;
  created_at: string;
}

interface NetRole {
  id: number;
  user_id: number;
  email: string;
  name?: string;
  callsign?: string;
  role: string;
}

export interface NetReportPdfData {
  net: Net;
  stats: NetStats;
  checkIns: CheckIn[];
  chatMessages: ChatMessage[];
  netRoles: NetRole[];
  preferUtc: boolean;
  /** DOM element IDs for map containers to capture as images */
  mapElementIds: string[];
  /** DOM element IDs for chart containers to capture as images */
  chartElementIds: string[];
}

// ========== HELPERS ==========

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const getFrequencyLabel = (freq: Frequency): string => {
  if (freq.frequency) return `${freq.frequency} ${freq.mode}`;
  if (freq.network && freq.talkgroup) return `${freq.network} TG ${freq.talkgroup}`;
  return freq.description || 'Unknown';
};

const getFrequencyById = (freqId: number | undefined, frequencies: Frequency[]): string => {
  if (!freqId) return '';
  const freq = frequencies.find(f => f.id === freqId);
  return freq ? getFrequencyLabel(freq) : '';
};

const getStatusLabel = (status: string): string => {
  const normalized = status.toLowerCase().replace('_', ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDateTimeForPdf = (dateString: string, preferUtc: boolean): string => {
  const normalized = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalized);
  if (preferUtc) {
    return date.toUTCString().replace('GMT', 'UTC');
  }
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  return `${date.toLocaleString()} ${shortTimeZone}`;
};

const formatTimeForPdf = (dateString: string, preferUtc: boolean): string => {
  const normalized = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalized);
  if (preferUtc) {
    return date.toUTCString().split(' ')[4] + ' UTC';
  }
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  return `${date.toLocaleTimeString()} ${shortTimeZone}`;
};

/**
 * Capture a DOM element as a JPEG data URL via html2canvas.
 * Returns null if the element is not found or capture fails.
 */
const captureElementAsImage = async (elementId: string): Promise<string | null> => {
  const el = document.getElementById(elementId);
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 5000,
      foreignObjectRendering: false,
      removeContainer: true,
    });
    // Use JPEG at 85% quality for compression
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    console.warn(`Failed to capture element #${elementId}`);
    return null;
  }
};

/**
 * Get the natural width/height ratio of a data URL image
 */
const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
};

// ========== MAIN EXPORT FUNCTION ==========

// Extend jsPDF type to include autoTable from the plugin
interface AutoTableJsPDF extends jsPDF {
  autoTable: (options: import('jspdf-autotable').UserOptions) => jsPDF;
  lastAutoTable?: { finalY: number };
}

export const exportNetReportPdf = async (data: NetReportPdfData): Promise<void> => {
  const { net, stats, checkIns, chatMessages, netRoles, preferUtc, mapElementIds, chartElementIds } = data;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as AutoTableJsPDF;
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Helper: ensure space for next content block, add page if needed
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Helper: draw a horizontal rule
  const drawHR = () => {
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 3;
  };

  // ========== TITLE HEADER ==========
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(25, 118, 210); // MUI primary blue
  pdf.text('ECTLogger', pageWidth / 2, y, { align: 'center' });
  y += 9;

  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Net Report', pageWidth / 2, y, { align: 'center' });
  y += 6;

  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(window.location.origin, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Blue accent line under header
  pdf.setDrawColor(25, 118, 210);
  pdf.setLineWidth(1);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ========== SECTION 1: NET INFO ==========
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(net.name, margin, y);
  y += 7;

  if (net.description) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    const descLines = pdf.splitTextToSize(net.description, contentWidth);
    pdf.text(descLines, margin, y);
    y += descLines.length * 4.5 + 2;
  }

  // Status chip
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  const statusText = net.status.toUpperCase();
  const statusWidth = pdf.getTextWidth(statusText) + 6;
  const statusColor: [number, number, number] = net.status === 'active' ? [76, 175, 80] : net.status === 'closed' ? [158, 158, 158] : [33, 150, 243];
  pdf.setFillColor(...statusColor);
  pdf.roundedRect(margin, y - 3.5, statusWidth, 5.5, 2, 2, 'F');
  pdf.text(statusText, margin + 3, y);
  y += 7;

  // Date/duration info
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  const infoLines = [
    `Started: ${stats.started_at ? formatDateTimeForPdf(stats.started_at, preferUtc) : '\u2014'}`,
    `Closed: ${stats.closed_at ? formatDateTimeForPdf(stats.closed_at, preferUtc) : '\u2014'}`,
    `Duration: ${stats.duration_minutes ? formatDuration(stats.duration_minutes) : '\u2014'}`,
  ];
  infoLines.forEach(line => {
    pdf.text(line, margin, y);
    y += 4.5;
  });
  y += 2;

  // Frequencies
  if (net.frequencies.length > 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Frequencies:', margin, y);
    pdf.setFont('helvetica', 'normal');
    const freqText = net.frequencies.map(f => getFrequencyLabel(f)).join(', ');
    pdf.text(freqText, margin + pdf.getTextWidth('Frequencies: '), y);
    y += 5;
  }

  // NCS Operators
  const ncsOperators = netRoles.filter(r => r.role === 'ncs');
  if (ncsOperators.length > 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Net Control Station(s):', margin, y);
    pdf.setFont('helvetica', 'normal');
    const ncsText = ncsOperators.map(r => r.callsign || r.name || r.email).join(', ');
    pdf.text(ncsText, margin + pdf.getTextWidth('Net Control Station(s): '), y);
    y += 5;
  }

  y += 3;
  drawHR();
  y += 3;

  // ========== SECTION 2: STATISTICS SUMMARY ==========
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Statistics Summary', margin, y);
  y += 8;

  // Stats cards rendered as a simple 4-column table
  const statsCardData = [
    [String(stats.total_check_ins), String(stats.unique_callsigns), String(stats.rechecks), stats.duration_minutes ? formatDuration(stats.duration_minutes) : '\u2014'],
  ];
  pdf.autoTable({
    startY: y,
    head: [['Total Check-ins', 'Unique Operators', 'Re-checks', 'Duration']],
    body: statsCardData,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [100, 100, 100], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 14, fontStyle: 'bold', halign: 'center', textColor: [25, 118, 210] },
    tableWidth: contentWidth,
  });
  y = (pdf.lastAutoTable?.finalY ?? y) + 6;

  // Status breakdown (text list instead of pie chart - keeps it native)
  if (Object.keys(stats.status_counts).length > 0) {
    ensureSpace(20);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Check-in Status Breakdown', margin, y);
    y += 5;

    pdf.autoTable({
      startY: y,
      head: [['Status', 'Count', 'Percentage']],
      body: Object.entries(stats.status_counts).map(([status, count]) => {
        const pct = stats.total_check_ins > 0 ? ((count / stats.total_check_ins) * 100).toFixed(0) + '%' : '0%';
        return [getStatusLabel(status), String(count), pct];
      }),
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [25, 118, 210], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      tableWidth: contentWidth / 2,
    });
    y = (pdf.lastAutoTable?.finalY ?? y) + 4;
  }

  // Frequency breakdown
  if (Object.keys(stats.check_ins_by_frequency).length > 0) {
    ensureSpace(20);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Check-ins by Frequency', margin, y);
    y += 5;

    pdf.autoTable({
      startY: y,
      head: [['Frequency', 'Check-ins']],
      body: Object.entries(stats.check_ins_by_frequency).map(([freq, count]) => [freq, String(count)]),
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [25, 118, 210], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      tableWidth: contentWidth / 2,
    });
    y = (pdf.lastAutoTable?.finalY ?? y) + 6;
  }

  // ========== SECTION 3: CHARTS (captured as images) ==========
  for (const chartId of chartElementIds) {
    const imgData = await captureElementAsImage(chartId);
    if (imgData) {
      const dims = await getImageDimensions(imgData);
      const imgWidth = Math.min(contentWidth, 140); // cap chart width
      const imgHeight = (dims.height / dims.width) * imgWidth;
      ensureSpace(imgHeight + 5);
      pdf.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight);
      y += imgHeight + 5;
    }
  }

  // ========== SECTION 4: CHECK-IN MAP (captured as images) ==========
  if (mapElementIds.length > 0) {
    ensureSpace(15);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Check-in Map', margin, y);
    y += 6;

    for (const mapId of mapElementIds) {
      const imgData = await captureElementAsImage(mapId);
      if (imgData) {
        const dims = await getImageDimensions(imgData);
        const imgWidth = contentWidth;
        const imgHeight = (dims.height / dims.width) * imgWidth;
        ensureSpace(imgHeight + 5);
        pdf.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight);
        y += imgHeight + 5;
      }
    }
  }

  y += 3;

  // ========== SECTION 5: CHECK-IN LOG TABLE ==========
  ensureSpace(20);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Check-in Log (${checkIns.length} entries)`, margin, y);
  y += 6;

  if (checkIns.length > 0) {
    pdf.autoTable({
      startY: y,
      head: [['#', 'Time', 'Callsign', 'Name', 'Location', 'Status', 'Frequency', 'Notes']],
      body: checkIns.map((ci, i) => {
        const notes = [ci.relayed_by ? `Via ${ci.relayed_by}` : '', ci.notes || ''].filter(Boolean).join(' - ');
        return [
          String(i + 1),
          formatTimeForPdf(ci.checked_in_at, preferUtc),
          ci.callsign + (ci.is_recheck ? ' (R)' : ''),
          ci.name || '',
          ci.location || '',
          getStatusLabel(ci.status),
          getFrequencyById(ci.frequency_id, net.frequencies),
          notes,
        ];
      }),
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [25, 118, 210], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },  // #
        1: { cellWidth: 22 },                     // Time
        2: { cellWidth: 22 },                     // Callsign
        3: { cellWidth: 22 },                     // Name
        4: { cellWidth: 30 },                     // Location
        5: { cellWidth: 18 },                     // Status
        6: { cellWidth: 22 },                     // Frequency
        7: { cellWidth: 'auto' },                 // Notes
      },
      tableWidth: contentWidth,
    });
    y = (pdf.lastAutoTable?.finalY ?? y) + 6;
  } else {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(120, 120, 120);
    pdf.text('No check-ins recorded', margin, y);
    y += 6;
  }

  // ========== SECTION 6: CHAT LOG ==========
  if (chatMessages.length > 0) {
    ensureSpace(20);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Chat Log (${chatMessages.length} messages)`, margin, y);
    y += 6;

    pdf.autoTable({
      startY: y,
      head: [['Time', 'From', 'Message']],
      body: chatMessages.map(msg => [
        formatTimeForPdf(msg.created_at, preferUtc),
        msg.is_system ? 'System' : (msg.callsign || 'Unknown'),
        msg.message,
      ]),
      margin: { left: margin, right: margin },
      theme: 'striped',
      headStyles: { fillColor: [25, 118, 210], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 'auto' },
      },
      didParseCell: (hookData) => {
        // Italicize system messages
        if (hookData.section === 'body') {
          const row = hookData.row.raw as string[];
          if (row && row[1] === 'System') {
            hookData.cell.styles.fontStyle = 'italic';
            hookData.cell.styles.textColor = [120, 120, 120];
          }
        }
      },
      tableWidth: contentWidth,
    });
    y = (pdf.lastAutoTable?.finalY ?? y) + 6;
  }

  // ========== SECTION 7: ICS-309 FORMAT ==========
  if (net.ics309_enabled) {
    ensureSpace(30);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('ICS-309 Communications Log', margin, y);
    y += 8;

    // ICS-309 Header info
    pdf.setFontSize(9);
    const icsFields = [
      ['1. Incident Name:', net.name],
      ['2. Operational Period:', `${stats.started_at ? formatDateTimeForPdf(stats.started_at, true) : '\u2014'} to ${stats.closed_at ? formatDateTimeForPdf(stats.closed_at, true) : '\u2014'}`],
      ['3. Radio Operator Name/Position:', ncsOperators.map(r => r.callsign || r.name).join(', ') || 'N/A'],
      ['4. Radio Channel:', net.frequencies.map(f => getFrequencyLabel(f)).join(', ') || 'N/A'],
    ];
    icsFields.forEach(([label, value]) => {
      ensureSpace(6);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(label, margin, y);
      pdf.setFont('helvetica', 'normal');
      const labelWidth = pdf.getTextWidth(label + ' ');
      const valueLines = pdf.splitTextToSize(value, contentWidth - labelWidth);
      pdf.text(valueLines, margin + labelWidth, y);
      y += valueLines.length * 4 + 2;
    });
    y += 2;

    // ICS-309 log table
    pdf.autoTable({
      startY: y,
      head: [['Time', 'From (Station)', 'To', 'Subject/Message']],
      body: checkIns.map(ci => [
        formatTimeForPdf(ci.checked_in_at, true),
        ci.callsign + (ci.relayed_by ? ` (via ${ci.relayed_by})` : ''),
        'Net Control',
        [
          ci.is_recheck ? 'Re-check' : 'Check-in',
          ci.name ? `- ${ci.name}` : '',
          ci.location ? `@ ${ci.location}` : '',
          ci.notes ? `- ${ci.notes}` : '',
        ].filter(Boolean).join(' '),
      ]),
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [25, 118, 210], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 30 },
        2: { cellWidth: 20 },
        3: { cellWidth: 'auto' },
      },
      tableWidth: contentWidth,
    });
    y = (pdf.lastAutoTable?.finalY ?? y) + 6;

    // ICS-309 Footer
    ensureSpace(12);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('5. Prepared by:', margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text('ECTLogger', margin + pdf.getTextWidth('5. Prepared by: '), y);
    y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Date/Time:', margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(formatDateTimeForPdf(new Date().toISOString(), true), margin + pdf.getTextWidth('Date/Time: '), y);
    y += 8;
  }

  // ========== FOOTER ==========
  ensureSpace(10);
  drawHR();
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    `Generated by ECTLogger on ${formatDateTimeForPdf(new Date().toISOString(), preferUtc)}`,
    pageWidth / 2, y + 3,
    { align: 'center' }
  );

  // ========== FILENAME ==========
  // Use the net's start date/time for the filename (not the export date)
  const netDate = stats.started_at || net.started_at;
  let dateStamp = '';
  if (netDate) {
    const normalized = netDate.endsWith('Z') ? netDate : netDate + 'Z';
    const d = new Date(normalized);
    // Format as YYYY-MM-DD_HHmm
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    dateStamp = `_${yyyy}-${mm}-${dd}_${hh}${min}`;
  }
  const safeName = net.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${safeName}_Net_Report${dateStamp}.pdf`;

  pdf.save(filename);
};
