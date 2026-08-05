import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { FormDefinition } from '../../hooks/useFormDefinitions';
import FormRenderer from './FormRenderer';
import RadiogramAssist from './RadiogramAssist';

// ========== TRAFFIC COMPOSER ==========
// Pick a form type, fill it in, file it. Shared by the Traffic section's
// "New" tab (Traffic.tsx) and the per-net Traffic panel's compose dialog
// (netview/TrafficPanel.tsx) so the picker/renderer/submit trio exists once.
//
// The netId prop is what makes traffic filed from inside a net actually
// belong to that net -- it flows straight through to FormCreate.net_id, which
// is what the net's traffic panel, the net-scoped RRI export, and the net's
// ICS-309 all read. Filing from the standalone Traffic section leaves it
// undefined, producing the unaffiliated traffic that has always been possible.

// A net may restrict which types its staff are offered
// (nets.traffic_form_types). Empty/undefined means "all of them" -- see
// components/forms/TrafficSettingsPanel.tsx. This filters the picker only;
// the API still accepts an off-list type, so unusual traffic arriving
// mid-incident is never rejected.
function applyAllowedTypes(definitions: FormDefinition[], allowed?: string[] | null): FormDefinition[] {
  if (!allowed || allowed.length === 0) return definitions;
  const filtered = definitions.filter((d) => allowed.includes(d.form_type));
  // A stale restriction (every listed type since disabled) must not leave the
  // operator with an empty picker and no way to log anything.
  return filtered.length > 0 ? filtered : definitions;
}

interface TrafficComposerProps {
  definitions: FormDefinition[];
  onCreated: (id: number) => void;
  netId?: number;
  allowedFormTypes?: string[] | null;
  // The net's stored originating strip, if it has one and no defined strip
  // type. Renders positional fields from that example instead of a type the
  // operator would otherwise have to invent on the spot.
  stripTemplate?: string | null;
  // Label shown above the picker, e.g. which net this will be filed against.
  contextLabel?: string;
}

const TrafficComposer: React.FC<TrafficComposerProps> = ({
  definitions,
  onCreated,
  netId,
  allowedFormTypes,
  stripTemplate,
  contextLabel,
}) => {
  const [selected, setSelected] = useState<FormDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- "Paste the full response strip" (structured strip types only) ----
  // A station reporting over the air often reads back the whole strip in one
  // breath rather than field by field. Rather than making the operator
  // re-type each value into its own box, let them paste the complete strip
  // and have it split across the same named fields FormRenderer shows.
  const [pasteResponseOpen, setPasteResponseOpen] = useState(false);
  const [pasteResponseText, setPasteResponseText] = useState('');
  const [pasteResponseBusy, setPasteResponseBusy] = useState(false);
  const [pasteResponseError, setPasteResponseError] = useState<string | null>(null);

  // ---- Ad-hoc strip mode (net has a pasted origin strip, no defined type) ----
  // Filed as RRI_STRIP_OTHER, whose definition requires a label and a
  // callsign alongside the raw text -- so both are collected here rather
  // than letting the submit 400 on missing required fields.
  const [stripFields, setStripFields] = useState<string[] | null>(null);
  const [stripValues, setStripValues] = useState<string[]>([]);
  const [stripCallSign, setStripCallSign] = useState('');
  const [stripLabel, setStripLabel] = useState('');

  useEffect(() => {
    if (!stripTemplate || !stripTemplate.trim()) {
      setStripFields(null);
      return;
    }
    let cancelled = false;
    // Tokenizing is stateless (writes nothing) -- it's only being used here to
    // learn how many fields the net's example strip has.
    trafficApi.tokenizeStripTemplate(stripTemplate)
      .then((resp) => {
        if (cancelled) return;
        const tokens = resp.data.tokens.map((t: any) => t.value);
        setStripFields(tokens);
        setStripValues(tokens.map(() => ''));
      })
      .catch(() => {
        if (!cancelled) setStripFields(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stripTemplate]);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  // Splits a pasted strip on the same "/" delimiters RRI uses and assigns
  // each token, in order, to the selected type's fields (already sorted by
  // sort_order by the API) -- the same positional convention
  // rri_strip.py::format_rri_strip uses to build the string in the first
  // place, just run in reverse. tokenizeStripTemplate is stateless.
  const handleFillFromPastedResponse = async () => {
    if (!selected) return;
    setPasteResponseBusy(true);
    setPasteResponseError(null);
    try {
      const resp = await trafficApi.tokenizeStripTemplate(pasteResponseText);
      const tokens: { value: string }[] = resp.data.tokens;
      const filled: Record<string, string> = {};
      selected.fields.forEach((field, index) => {
        if (index < tokens.length) filled[field.name] = tokens[index].value;
      });
      setValues((prev) => ({ ...prev, ...filled }));
      if (tokens.length !== selected.fields.length) {
        setPasteResponseError(
          `Filled ${Math.min(tokens.length, selected.fields.length)} of ${selected.fields.length} fields -- the pasted strip had ${tokens.length} value${tokens.length === 1 ? '' : 's'}. Check the rest by hand.`
        );
      } else {
        setPasteResponseOpen(false);
      }
    } catch (err) {
      setPasteResponseError(getErrorMessage(err, 'Could not read that as a strip'));
    } finally {
      setPasteResponseBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await trafficApi.create({
        form_type: selected.form_type,
        net_id: netId,
        field_values: values,
      });
      onCreated(resp.data.id);
      setSelected(null);
      setValues({});
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create this traffic item'));
    } finally {
      setSaving(false);
    }
  };

  // Files the net's ad-hoc strip as a general RRI strip: the positional values
  // rejoined into RRI's canonical slash-delimited form. Reuses the
  // RRI_STRIP_OTHER catch-all rather than inventing a second storage shape.
  const handleSubmitStrip = async () => {
    setSaving(true);
    setError(null);
    try {
      const resp = await trafficApi.create({
        form_type: 'RRI_STRIP_OTHER',
        net_id: netId,
        field_values: {
          subject: stripLabel.trim() || `Strip from ${stripCallSign.trim().toUpperCase()}`,
          call_sign: stripCallSign.trim().toUpperCase(),
          strip_text: `${stripValues.join('/')}//`,
        },
      });
      onCreated(resp.data.id);
      setStripValues((stripFields || []).map(() => ''));
      setStripCallSign('');
      setStripLabel('');
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to log this strip'));
    } finally {
      setSaving(false);
    }
  };

  const pickable = applyAllowedTypes(definitions, allowedFormTypes);

  // ========== TYPE PICKER ==========
  if (!selected) {
    return (
      <Box>
        {contextLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {contextLabel}
          </Typography>
        )}

        {/* Answering the net's own originating strip — offered first, since on
            an RRI net or drill this is the thing most reports will be. */}
        {stripFields && stripFields.length > 0 && (
          <Box sx={{ mb: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="subtitle1" gutterBottom>
              Answer this net's strip
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Fields come from the originating strip set for this net.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              required
              size="small"
              margin="dense"
              label="Reporting station"
              placeholder="W1AW"
              value={stripCallSign}
              onChange={(e) => setStripCallSign(e.target.value)}
            />
            <TextField
              fullWidth
              size="small"
              margin="dense"
              label="Label (optional)"
              placeholder="SITREP - Route 4 bridge closure"
              value={stripLabel}
              onChange={(e) => setStripLabel(e.target.value)}
            />
            {stripFields.map((example, index) => (
              <TextField
                key={index}
                fullWidth
                size="small"
                margin="dense"
                label={`Field ${index + 1}`}
                placeholder={example}
                value={stripValues[index] ?? ''}
                onChange={(e) =>
                  setStripValues((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                }
              />
            ))}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleSubmitStrip}
                disabled={saving || !stripCallSign.trim() || stripValues.every((v) => !v.trim())}
                sx={{ minHeight: 44 }}
              >
                {saving ? 'Logging...' : 'Log strip'}
              </Button>
            </Box>
          </Box>
        )}

        <Typography variant="subtitle1" sx={{ mb: 2 }}>Choose a form type</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {pickable.map((d) => (
            <Card key={d.form_type} sx={{ width: { xs: '100%', sm: 260 } }}>
              <CardActionArea onClick={() => setSelected(d)} sx={{ minHeight: 44 }}>
                <CardContent>
                  <Typography variant="subtitle1">{d.title}</Typography>
                  {d.description && (
                    <Typography variant="body2" color="text.secondary">{d.description}</Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  // ========== SELECTED FORM ==========
  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => setSelected(null)}
        sx={{ mb: 2, minHeight: 44 }}
      >
        Choose a different type
      </Button>
      <Typography variant="h6" sx={{ mb: 2 }}>{selected.title}</Typography>
      {contextLabel && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {contextLabel}
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {/* RADIOGRAM gets the NTS-assisted layer (normalization preview, check
          counter, ARL picker, HX help, auto-fill); every other form type
          keeps using the bare generic renderer. */}
      {selected.form_type === 'RADIOGRAM' ? (
        <RadiogramAssist definition={selected} values={values} onChange={handleChange} disabled={saving} />
      ) : (
        <FormRenderer definition={selected} values={values} onChange={handleChange} disabled={saving} />
      )}

      {/* ========== PASTE THE FULL RESPONSE STRIP ========== */}
      {/* Only for structured strip types (real named fields, not the
          RRI_STRIP_OTHER raw catch-all, which already has nothing but a
          single free-text box). A station reporting over the air often reads
          the whole strip back in one breath -- this fills every field above
          from that instead of making the operator split it out by hand. */}
      {selected.output_format === 'rri_strip' && (
        <Box sx={{ mt: 3 }}>
          {!pasteResponseOpen ? (
            <Button type="button" size="small" onClick={() => setPasteResponseOpen(true)} sx={{ minHeight: 44 }}>
              Or paste the full response strip
            </Button>
          ) : (
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Paste the strip exactly as reported over the air -- it fills the fields above.
              </Typography>
              {pasteResponseError && <Alert severity="warning" sx={{ mb: 1 }}>{pasteResponseError}</Alert>}
              <TextField
                fullWidth
                multiline
                rows={2}
                size="small"
                value={pasteResponseText}
                onChange={(e) => setPasteResponseText(e.target.value)}
                placeholder={`${selected.form_type}/.../.../.../ /...//`}
                sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  type="button"
                  variant="contained"
                  size="small"
                  disabled={pasteResponseBusy || !pasteResponseText.trim()}
                  onClick={handleFillFromPastedResponse}
                  sx={{ minHeight: 44 }}
                >
                  {pasteResponseBusy ? 'Filling...' : 'Fill fields'}
                </Button>
                <Button
                  type="button"
                  size="small"
                  onClick={() => { setPasteResponseOpen(false); setPasteResponseError(null); }}
                  sx={{ minHeight: 44 }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleSubmit}
          disabled={saving}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Saving...' : 'Create'}
        </Button>
      </Box>
    </Box>
  );
};

export default TrafficComposer;
