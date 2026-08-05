import React from 'react';
import { Box } from '@mui/material';
import RadiogramPrintView from './RadiogramPrintView';
import ICS213PrintView from './ICS213PrintView';
import RRIStripPrintView from './RRIStripPrintView';

// ========== NET TRAFFIC PRINT BUNDLE ==========
// Every form filed on one net, each rendered in its own form-accurate print
// view, stacked into a single off-screen element for utils/pdfExport.ts to
// capture -- the bulk equivalent of the per-form PDF button in
// TrafficDetail.tsx.
//
// Each form is wrapped in a `data-pdf-avoid-break` div, which is the existing
// hook exportToPdf() uses to compute "smart" page boundaries: it never slices
// through a marked element, so a Radiogram is never cut in half across two
// pages. That is also why this doesn't need the `usePageBreaks` option --
// that option is declared in PdfExportOptions but never implemented.

interface BundleForm {
  id: number;
  form_type: string;
  definition: { output_format: string; [k: string]: any };
  [k: string]: any;
}

interface NetTrafficPrintBundleProps {
  id: string;
  forms: BundleForm[];
}

const NetTrafficPrintBundle: React.FC<NetTrafficPrintBundleProps> = ({ id, forms }) => (
  <Box id={id} sx={{ backgroundColor: '#fff', width: 800 }}>
    {forms.map((form) => (
      <Box key={form.id} data-pdf-avoid-break sx={{ mb: 4 }}>
        {/* Same per-type dispatch TrafficDetail.tsx uses -- keyed on
            output_format rather than a hardcoded form_type list, so a
            strip type defined at runtime prints correctly with no change
            here. */}
        {form.form_type === 'RADIOGRAM' ? (
          <RadiogramPrintView id={`bundle-form-${form.id}`} form={form as any} />
        ) : form.form_type === 'ICS213' ? (
          <ICS213PrintView id={`bundle-form-${form.id}`} form={form as any} />
        ) : form.definition?.output_format === 'rri_strip' || form.definition?.output_format === 'rri_strip_raw' ? (
          <RRIStripPrintView id={`bundle-form-${form.id}`} form={form as any} />
        ) : null}
      </Box>
    ))}
  </Box>
);

export default NetTrafficPrintBundle;
