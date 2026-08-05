import React from 'react';
import { printPageStyle, gridTableStyle, cellStyle, labelCaptionStyle, formatFiledDate } from './printStyles';
import { FormDefinitionField } from '../../../hooks/useFormDefinitions';

// ========== RRIStripPrintView ==========
// One shared print view for all RRI strip types (WXOBS, GYX-CAR-SKYWARN,
// RRI_STRIP_OTHER) -- unlike Radiogram/ICS-213, these aren't paper forms to
// replicate pixel-for-pixel, just a Winlink template's field dump. Shows the
// canonical string (form.normalized_text) in monospace -- exactly what
// pastes into RRI's Winlink template or a SKYWARN sheet -- plus a labeled
// field grid below for human readability, driven generically by
// form.definition.fields so it needs no per-type branching.

interface RRIStripFormLike {
  form_type: string;
  filed_at: string;
  normalized_text: string | null;
  field_values: Record<string, any>;
  definition: {
    title: string;
    fields: FormDefinitionField[];
  };
}

interface RRIStripPrintViewProps {
  id: string;
  form: RRIStripFormLike;
}

const RRIStripPrintView: React.FC<RRIStripPrintViewProps> = ({ id, form }) => {
  const v = form.field_values || {};

  return (
    <div id={id} style={printPageStyle}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>RADIO RELAY INTERNATIONAL</div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{form.definition.title}</div>
        <div style={{ fontSize: 10 }}>{formatFiledDate(form.filed_at)}</div>
      </div>

      <div
        style={{
          border: '1px solid #000000',
          padding: 8,
          marginBottom: 10,
          fontFamily: 'monospace',
          fontSize: 10,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <span style={labelCaptionStyle}>STRIP TEXT (paste directly into Winlink or the SKYWARN sheet)</span>
        {form.normalized_text || ''}
      </div>

      <table style={gridTableStyle}>
        <tbody>
          {form.definition.fields.map((field) => (
            <tr key={field.name}>
              <td style={{ ...cellStyle, width: '35%', fontWeight: 700 }}>{field.label}</td>
              <td style={{ ...cellStyle, whiteSpace: 'pre-wrap' }}>{v[field.name] || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RRIStripPrintView;
