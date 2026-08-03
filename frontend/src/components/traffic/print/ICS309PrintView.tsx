import React from 'react';
import { printPageStyle, gridTableStyle, cellStyle, labelCaptionStyle } from './printStyles';

// ========== ICS309PrintView ==========
// A pixel-accurate replica of FEMA's ICS 309 Communications Log, for
// form-accurate PDF export. Fed by GET /nets/{id}/export/ics309?format=json
// (netApi.getIcs309Log), which draws from the exact same
// _build_ics309_data() the CSV download uses -- see nets_export.py -- so the
// two formats never diverge. Captured off-screen by utils/pdfExport.ts, same
// pipeline as RadiogramPrintView/ICS213PrintView.
//
// Used both standalone (NetView's "PDF" button beside the existing CSV
// download) and inside the full NetReport PDF, so there is exactly one
// accurate rendering of this form, not two.
//
// The FEMA form splits FROM/TO into Call Sign/ID + Msg # sub-columns; our
// check-in and chat rows have no per-entry message number (only Assisted
// Traffic Handling rows do, and that's already folded into the message
// text), so FROM/TO are rendered as single columns rather than inventing an
// empty sub-column no row would ever populate.

export interface Ics309LogEntry {
  time: string;
  from_station: string;
  to_station: string;
  message: string;
}

export interface Ics309LogData {
  incident_name: string;
  operational_period_from: string | null;
  operational_period_to: string | null;
  radio_operator: string;
  channel: string;
  entries: Ics309LogEntry[];
  prepared_by: string;
  prepared_at: string | null;
}

interface Ics309PrintViewProps {
  id: string;
  data: Ics309LogData;
}

const blockLabelStyle: React.CSSProperties = { ...cellStyle, fontWeight: 700, fontSize: 10 };

const ICS309PrintView: React.FC<Ics309PrintViewProps> = ({ id, data }) => {
  return (
    <div id={id} style={printPageStyle}>
      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
        Communications Log (ICS 309)
      </div>

      <table style={gridTableStyle}>
        <tbody>
          <tr>
            <td style={{ ...blockLabelStyle, width: '60%' }}>1. Incident Name</td>
            <td style={{ ...blockLabelStyle, width: '40%' }}>2. Operational Period</td>
          </tr>
          <tr>
            <td style={cellStyle}>{data.incident_name}</td>
            <td style={cellStyle}>
              From: {data.operational_period_from || ''}<br />
              To: {data.operational_period_to || ''}
            </td>
          </tr>
          <tr>
            <td style={blockLabelStyle}>3. Radio Net Name</td>
            <td style={blockLabelStyle}>4. Radio Operator (Name, Call Sign)</td>
          </tr>
          <tr>
            <td style={cellStyle}>{data.incident_name}{data.channel ? ` (${data.channel})` : ''}</td>
            <td style={cellStyle}>{data.radio_operator}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <thead>
          <tr>
            <td style={{ ...blockLabelStyle, width: '12%', textAlign: 'center' }}>Time (24:00)</td>
            <td style={{ ...blockLabelStyle, width: '18%', textAlign: 'center' }}>From</td>
            <td style={{ ...blockLabelStyle, width: '18%', textAlign: 'center' }}>To</td>
            <td style={{ ...blockLabelStyle, width: '52%', textAlign: 'center' }}>Message</td>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry, i) => (
            <tr key={i}>
              <td style={{ ...cellStyle, fontSize: 10, whiteSpace: 'nowrap' }}>{entry.time}</td>
              <td style={{ ...cellStyle, fontSize: 10 }}>{entry.from_station}</td>
              <td style={{ ...cellStyle, fontSize: 10 }}>{entry.to_station}</td>
              <td style={{ ...cellStyle, fontSize: 10 }}>{entry.message}</td>
            </tr>
          ))}
          {data.entries.length === 0 && (
            <tr>
              <td style={cellStyle} colSpan={4}>&nbsp;</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...blockLabelStyle, width: '40%' }}>6. Prepared By (Name, Position)</td>
            <td style={{ ...blockLabelStyle, width: '35%' }}>Signature</td>
            <td style={{ ...blockLabelStyle, width: '25%' }}>7. Date &amp; Time Prepared</td>
          </tr>
          <tr>
            <td style={cellStyle}>{data.prepared_by}</td>
            <td style={cellStyle}>&nbsp;</td>
            <td style={cellStyle}>{data.prepared_at || ''}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 8, marginTop: 4, color: '#000000' }}>
        <span style={labelCaptionStyle as React.CSSProperties}>ICS 309</span>
      </div>
    </div>
  );
};

export default ICS309PrintView;
