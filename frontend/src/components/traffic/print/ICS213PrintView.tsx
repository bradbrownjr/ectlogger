import React from 'react';
import { printPageStyle, gridTableStyle, cellStyle, labelCaptionStyle } from './printStyles';

// ========== ICS213PrintView ==========
// A pixel-accurate replica of FEMA's ICS 213 General Message form (the
// 10-block layout: Incident Name / To / From / Subject-Date-Time / Message /
// Approved by / Reply / Replied by), for form-accurate PDF export. Captured
// off-screen by utils/pdfExport.ts, same pipeline as RadiogramPrintView.
//
// ECTLogger tracks priority and reply_requested, which the real ICS-213 has
// no box for -- they're surfaced as a small caption above the form instead
// of invented into the official numbered layout, so the form itself stays
// 1:1 with the FEMA original. Blocks 8-10 (Approved by / Reply / Replied by)
// are printed blank and ruled -- ECTLogger doesn't track a reply workflow,
// so those are meant to be hand-filled, same as REC'D/SENT on the radiogram.

interface Ics213FormLike {
  filed_at: string;
  field_values: Record<string, any>;
}

interface Ics213PrintViewProps {
  id: string;
  form: Ics213FormLike;
}

function formatDate(filedAt: string | null | undefined): string {
  if (!filedAt) return '';
  const d = new Date(filedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US');
}

function formatTime(filedAt: string | null | undefined): string {
  if (!filedAt) return '';
  const d = new Date(filedAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const blockLabelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, fontSize: 11 };

const ICS213PrintView: React.FC<Ics213PrintViewProps> = ({ id, form }) => {
  const v = form.field_values || {};
  const toDisplay = [v.to_name, v.to_position ? `(${v.to_position})` : ''].filter(Boolean).join(' ');
  const fromDisplay = [v.from_name, v.from_position ? `(${v.from_position})` : ''].filter(Boolean).join(' ');

  return (
    <div id={id} style={printPageStyle}>
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        GENERAL MESSAGE (ICS 213)
      </div>
      {(v.priority || v.reply_requested) && (
        <div style={{ textAlign: 'center', fontSize: 9, fontStyle: 'italic', marginBottom: 6 }}>
          {v.priority && `Priority: ${v.priority}`}
          {v.priority && v.reply_requested ? '  ·  ' : ''}
          {v.reply_requested && `Reply Requested: ${v.reply_requested}`}
        </div>
      )}

      <table style={gridTableStyle}>
        <tbody>
          <tr>
            <td style={{ ...blockLabelStyle, width: '18%' }}>1. Incident Name</td>
            <td style={cellStyle}>{v.incident_name || ''}</td>
          </tr>
          <tr>
            <td style={blockLabelStyle}>2. To (Name and Position)</td>
            <td style={cellStyle}>{toDisplay}</td>
          </tr>
          <tr>
            <td style={blockLabelStyle}>3. From (Name and Position)</td>
            <td style={cellStyle}>{fromDisplay}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...blockLabelStyle, width: '60%' }}>4. Subject</td>
            <td style={{ ...blockLabelStyle, width: '20%' }}>5. Date</td>
            <td style={{ ...blockLabelStyle, width: '20%' }}>6. Time</td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, height: 22 }}>{v.subject || ''}</td>
            <td style={cellStyle}>{formatDate(form.filed_at)}</td>
            <td style={cellStyle}>{formatTime(form.filed_at)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, height: 260, whiteSpace: 'pre-wrap' }}>
              <span style={labelCaptionStyle}>7. Message</span>
              {v.message || ''}
            </td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontSize: 10 }}>
              8. Approved by: Name: _________________________ Signature: _________________________ Position/Title: _________________
            </td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, height: 220 }}>
              <span style={labelCaptionStyle}>9. Reply</span>
            </td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, fontSize: 10 }}>
              10. Replied by: Name: _________________________ Position/Title: _________________ Signature: _________________________
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ICS213PrintView;
