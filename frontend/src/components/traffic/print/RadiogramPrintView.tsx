import React from 'react';
import { printPageStyle, gridTableStyle, cellStyle, labelCaptionStyle, formatFiledDate } from './printStyles';

// ========== RadiogramPrintView ==========
// A pixel-accurate replica of the ARRL Radiogram pad (the standard NTS
// message form), for form-accurate PDF export. Captured off-screen by
// utils/pdfExport.ts's exportElementToPdf, same pipeline already used by
// ActivityTab/NetReport/NetStatistics -- see TRAFFIC-HANDLING-DESIGN.md
// section 4.5's revision note on why this replaced the backend reportlab
// text dump.
//
// "THIS RADIO MESSAGE WAS RECEIVED AT" and the REC'D/SENT signature strip
// are printed blank and ruled, exactly as on the real pad -- ECTLogger has
// no delivery-confirmation workflow, so those boxes are meant to be
// hand-filled by whoever takes final delivery, the same as they would be
// on a paper copy.

interface RadiogramFormLike {
  message_number: string | null;
  precedence: string | null;
  handling: string | null;
  station_of_origin: string | null;
  check_count: number | null;
  filed_at: string;
  normalized_text: string | null;
  field_values: Record<string, any>;
}

interface RadiogramPrintViewProps {
  id: string;
  form: RadiogramFormLike;
}

const MIN_MESSAGE_LINES = 10;

const RadiogramPrintView: React.FC<RadiogramPrintViewProps> = ({ id, form }) => {
  const v = form.field_values || {};

  const toName = [v.to_name, v.to_callsign].filter(Boolean).join(' ');
  const toCityStateZip = [v.to_city_state, v.to_zip].filter(Boolean).join(' ');

  const bodyLines = (form.normalized_text || v.text || '')
    .split('\n')
    .filter((line: string, i: number, arr: string[]) => !(i === arr.length - 1 && line === ''));
  const messageLines = [...bodyLines];
  while (messageLines.length < MIN_MESSAGE_LINES) messageLines.push('');

  const headerCells: Array<[string, string]> = [
    ['NUMBER', form.message_number || v.number || ''],
    ['PRECEDENCE', form.precedence || ''],
    ['HX', form.handling || ''],
    ['STATION OF ORIGIN', form.station_of_origin || ''],
    ['CHECK', form.check_count != null ? String(form.check_count) : ''],
    ['PLACE OF ORIGIN', v.place_of_origin || ''],
    ['TIME FILED', v.filed_time || ''],
    ['DATE', formatFiledDate(form.filed_at)],
  ];

  return (
    <div id={id} style={printPageStyle}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>THE AMERICAN RADIO RELAY LEAGUE</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>RADIOGRAM</div>
        <div style={{ fontSize: 10 }}>VIA AMATEUR RADIO</div>
      </div>

      <table style={gridTableStyle}>
        <tbody>
          <tr>
            {headerCells.map(([label]) => (
              <td key={label} style={{ ...cellStyle, textAlign: 'center' }}>
                <span style={labelCaptionStyle}>{label}</span>
              </td>
            ))}
          </tr>
          <tr>
            {headerCells.map(([label, value]) => (
              <td key={label} style={{ ...cellStyle, textAlign: 'center', height: 24 }}>{value}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <table style={{ ...gridTableStyle, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '58%' }}>
              <span style={labelCaptionStyle}>TO</span>
              <div>{toName}</div>
              <div>{v.to_address || ''}</div>
              <div>{toCityStateZip}</div>
              {v.to_phone && <div>TEL {v.to_phone}</div>}
              {v.to_email && <div>EMAIL {v.to_email}</div>}
            </td>
            <td style={{ ...cellStyle, width: '42%' }}>
              <span style={labelCaptionStyle}>THIS RADIO MESSAGE WAS RECEIVED AT</span>
              <div>AMATEUR STATION _________________ PHONE _________</div>
              <div style={{ marginTop: 10 }}>NAME _______________________________</div>
              <div style={{ marginTop: 10 }}>STREET ADDRESS _____________________</div>
              <div style={{ marginTop: 10 }}>CITY, STATE, ZIP ___________________</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 4 }}>
        {messageLines.map((line, i) => (
          <div
            key={i}
            style={{
              borderBottom: '1px solid #000000',
              minHeight: 18,
              fontSize: 12,
              padding: '2px 2px 3px',
            }}
          >
            {line}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, textAlign: 'right', fontSize: 12 }}>
        {v.signature || ''}
      </div>

      <table style={{ ...gridTableStyle, marginTop: 14 }}>
        <tbody>
          <tr>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>FROM</span></td>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>DATE</span></td>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>TIME</span></td>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>TO</span></td>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>DATE</span></td>
            <td style={{ ...cellStyle, width: '16.6%' }}><span style={labelCaptionStyle}>TIME</span></td>
          </tr>
          <tr>
            <td style={{ ...cellStyle, height: 22 }}>REC'D</td>
            <td style={cellStyle} />
            <td style={cellStyle} />
            <td style={cellStyle}>SENT</td>
            <td style={cellStyle} />
            <td style={cellStyle} />
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default RadiogramPrintView;
