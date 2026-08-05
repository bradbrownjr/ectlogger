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

// One token of a net's originating strip. In RRI's "RI" (Request for
// Information) format the origin strip is a TEMPLATE: each slash-delimited
// token is the NAME of a field an answering station fills in, not an example
// value. So "ETO/CALL SIGN/SKYWARN ID(or NA)/CITY/..." defines fields named
// "CALL SIGN", "SKYWARN ID(or NA)", "CITY", ... -- which is why these render
// as the field labels here rather than as placeholder text.
interface StripToken {
  value: string;
  starts_new_section: boolean;
}

// The composer offers real form definitions plus, when the net stored an
// origin strip that isn't a formally-defined type, one synthetic option for
// answering that strip. The synthetic option REPLACES the RRI_STRIP_OTHER
// card rather than sitting alongside it -- both file the same
// RRI_STRIP_OTHER form, so offering both was two doors to one room.
type ComposerOption =
  | { kind: 'definition'; key: string; title: string; description?: string | null; definition: FormDefinition }
  | { kind: 'netStrip'; key: string; title: string; description?: string | null; keyword: string; tokens: StripToken[] };

interface TrafficComposerProps {
  definitions: FormDefinition[];
  onCreated: (id: number) => void;
  netId?: number;
  allowedFormTypes?: string[] | null;
  // The net's nominated strip type (nets.traffic_strip_form_type) -- resolved
  // against `definitions` rather than trusted as-is, since it's a bare
  // form_type string that can point at nothing (a disabled/deleted type).
  // Only a match with output_format 'rri_strip' counts as a real defined
  // type; anything else falls back to stripTemplateRaw.
  stripFormType?: string | null;
  // The net's stored originating strip text, used when stripFormType doesn't
  // resolve. Its tokens become the field labels of the synthetic option above.
  stripTemplateRaw?: string | null;
  // Label shown above the picker, e.g. which net this will be filed against.
  contextLabel?: string;
}

const TrafficComposer: React.FC<TrafficComposerProps> = ({
  definitions,
  onCreated,
  netId,
  allowedFormTypes,
  stripFormType,
  stripTemplateRaw,
  contextLabel,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- "Paste the full response strip" (structured strip types only) ----
  // A station reporting over the air often reads back the whole strip in one
  // breath rather than field by field, so let them paste it and have it
  // split across the same fields shown above.
  const [pasteResponseOpen, setPasteResponseOpen] = useState(false);
  const [pasteResponseText, setPasteResponseText] = useState('');
  const [pasteResponseBusy, setPasteResponseBusy] = useState(false);
  const [pasteResponseError, setPasteResponseError] = useState<string | null>(null);

  // ---- The net's origin strip, tokenized into field names ----
  const [stripKeyword, setStripKeyword] = useState('');
  const [stripTokens, setStripTokens] = useState<StripToken[] | null>(null);
  const [stripValues, setStripValues] = useState<string[]>([]);
  const [stripCallSign, setStripCallSign] = useState('');
  const [stripLabel, setStripLabel] = useState('');

  const resolvedStripDefinition = stripFormType
    ? definitions.find((d) => d.form_type === stripFormType && d.output_format === 'rri_strip')
    : undefined;

  // Only tokenize the raw template when no real defined type resolved --
  // otherwise that type's own fields are strictly better.
  const effectiveStripTemplate = resolvedStripDefinition ? null : stripTemplateRaw;

  useEffect(() => {
    if (!effectiveStripTemplate || !effectiveStripTemplate.trim()) {
      setStripTokens(null);
      return;
    }
    let cancelled = false;
    // Stateless (writes nothing) -- used here only to learn the strip's
    // field names and where its "/ /" section breaks fall.
    trafficApi.tokenizeStripTemplate(effectiveStripTemplate)
      .then((resp) => {
        if (cancelled) return;
        const tokens: StripToken[] = resp.data.tokens;
        setStripKeyword(resp.data.suggested_form_type || '');
        setStripTokens(tokens);
        setStripValues(tokens.map(() => ''));
      })
      .catch(() => {
        if (!cancelled) setStripTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveStripTemplate]);

  // ========== BUILD THE OPTION LIST ==========
  const netStripTokens = stripTokens;
  const options: ComposerOption[] = (() => {
    const allowed = applyAllowedTypes(definitions, allowedFormTypes);
    const list: ComposerOption[] = allowed
      // The net's own strip replaces the raw catch-all when it exists --
      // both file RRI_STRIP_OTHER, so showing both is redundant.
      .filter((d) => !(netStripTokens && d.output_format === 'rri_strip_raw'))
      .map((d) => ({
        kind: 'definition' as const,
        key: `def:${d.form_type}`,
        title: d.title,
        description: d.description,
        definition: d,
      }));

    if (netStripTokens && netStripTokens.length > 0) {
      list.unshift({
        kind: 'netStrip',
        key: 'netStrip',
        title: stripKeyword ? `${stripKeyword} (this net's strip)` : "This net's strip",
        description: `Answer the originating strip set for this net -- ${netStripTokens.length} fields.`,
        keyword: stripKeyword,
        tokens: netStripTokens,
      });
    }

    // The net's nominated defined type stays reachable even if nobody
    // separately ticked its box under "Traffic this net takes."
    if (resolvedStripDefinition && !list.some((o) => o.key === `def:${resolvedStripDefinition.form_type}`)) {
      list.unshift({
        kind: 'definition',
        key: `def:${resolvedStripDefinition.form_type}`,
        title: resolvedStripDefinition.title,
        description: resolvedStripDefinition.description,
        definition: resolvedStripDefinition,
      });
    }
    return list;
  })();

  // With exactly one option there is nothing to choose -- go straight to the
  // form instead of making the operator click through a single card.
  const autoSelected = options.length === 1;
  useEffect(() => {
    if (autoSelected && selectedKey === null) setSelectedKey(options[0].key);
  }, [autoSelected, options, selectedKey]);

  const selected = options.find((o) => o.key === selectedKey) ?? null;

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const resetAfterCreate = () => {
    setValues({});
    setStripValues((netStripTokens || []).map(() => ''));
    setStripCallSign('');
    setStripLabel('');
    setPasteResponseOpen(false);
    setPasteResponseText('');
    // Keep the single auto-selected option selected; otherwise return to the
    // picker so the next item can be a different type.
    if (!autoSelected) setSelectedKey(null);
  };

  // Splits a pasted strip on the same "/" delimiters RRI uses and assigns
  // each token, in order, to the selected type's fields -- the same
  // positional convention rri_strip.py::format_rri_strip uses to build the
  // string, run in reverse.
  const handleFillFromPastedResponse = async () => {
    if (!selected) return;
    setPasteResponseBusy(true);
    setPasteResponseError(null);
    try {
      const resp = await trafficApi.tokenizeStripTemplate(pasteResponseText);
      const tokens: StripToken[] = resp.data.tokens;
      const targetCount = selected.kind === 'netStrip' ? selected.tokens.length : selected.definition.fields.length;

      if (selected.kind === 'netStrip') {
        setStripValues((prev) => prev.map((v, i) => (i < tokens.length ? tokens[i].value : v)));
      } else {
        const filled: Record<string, string> = {};
        selected.definition.fields.forEach((field, index) => {
          if (index < tokens.length) filled[field.name] = tokens[index].value;
        });
        setValues((prev) => ({ ...prev, ...filled }));
      }

      if (tokens.length !== targetCount) {
        setPasteResponseError(
          `Filled ${Math.min(tokens.length, targetCount)} of ${targetCount} fields -- the pasted strip had ${tokens.length} value${tokens.length === 1 ? '' : 's'}. Check the rest by hand.`
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
    if (!selected || selected.kind !== 'definition') return;
    setSaving(true);
    setError(null);
    try {
      const resp = await trafficApi.create({
        form_type: selected.definition.form_type,
        net_id: netId,
        field_values: values,
      });
      onCreated(resp.data.id);
      resetAfterCreate();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create this traffic item'));
    } finally {
      setSaving(false);
    }
  };

  // Files the net's origin-strip answer as a general RRI strip, rebuilding
  // RRI's canonical slash-delimited string: the leading keyword, each value
  // in order, and an empty token wherever the origin strip had a "/ /"
  // section break -- so the stored text round-trips to the same shape the
  // originating station sent.
  const handleSubmitStrip = async () => {
    if (!selected || selected.kind !== 'netStrip') return;
    setSaving(true);
    setError(null);
    try {
      const parts: string[] = selected.keyword ? [selected.keyword] : [];
      selected.tokens.forEach((token, index) => {
        if (token.starts_new_section) parts.push(' ');
        parts.push(stripValues[index] ?? '');
      });
      const resp = await trafficApi.create({
        form_type: 'RRI_STRIP_OTHER',
        net_id: netId,
        field_values: {
          subject: stripLabel.trim() || `${selected.keyword || 'Strip'} from ${stripCallSign.trim().toUpperCase()}`,
          call_sign: stripCallSign.trim().toUpperCase(),
          strip_text: `${parts.join('/')}//`,
        },
      });
      onCreated(resp.data.id);
      resetAfterCreate();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to log this strip'));
    } finally {
      setSaving(false);
    }
  };

  // ========== TYPE PICKER ==========
  // No fields are rendered here -- a form only appears once a type is chosen
  // (or auto-chosen, when the net accepts exactly one).
  if (!selected) {
    return (
      <Box>
        {contextLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {contextLabel}
          </Typography>
        )}
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Choose a form type</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {options.map((option) => (
            <Card key={option.key} sx={{ width: { xs: '100%', sm: 260 } }}>
              <CardActionArea onClick={() => setSelectedKey(option.key)} sx={{ minHeight: 44 }}>
                <CardContent>
                  <Typography variant="subtitle1">{option.title}</Typography>
                  {option.description && (
                    <Typography variant="body2" color="text.secondary">{option.description}</Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  const pasteBox = (
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
  );

  const header = (
    <>
      {/* Only offer "choose a different type" when there IS another type. */}
      {!autoSelected && (
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => setSelectedKey(null)}
          sx={{ mb: 2, minHeight: 44 }}
        >
          Choose a different type
        </Button>
      )}
      <Typography variant="h6" sx={{ mb: 2 }}>{selected.title}</Typography>
      {contextLabel && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {contextLabel}
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    </>
  );

  // ========== ANSWERING THE NET'S ORIGIN STRIP ==========
  if (selected.kind === 'netStrip') {
    return (
      <Box>
        {header}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Field names come from the originating strip set for this net.
        </Typography>
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
        {selected.tokens.map((token, index) => (
          <TextField
            key={index}
            fullWidth
            size="small"
            margin="dense"
            // The token IS the field name (RRI "RI" template convention).
            label={token.value}
            value={stripValues[index] ?? ''}
            onChange={(e) =>
              setStripValues((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
            }
          />
        ))}

        {pasteBox}

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
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
    );
  }

  // ========== A REAL DEFINED FORM TYPE ==========
  return (
    <Box>
      {header}
      {/* RADIOGRAM gets the NTS-assisted layer (normalization preview, check
          counter, ARL picker, HX help, auto-fill); every other form type
          keeps using the bare generic renderer. */}
      {selected.definition.form_type === 'RADIOGRAM' ? (
        <RadiogramAssist definition={selected.definition} values={values} onChange={handleChange} disabled={saving} />
      ) : (
        <FormRenderer definition={selected.definition} values={values} onChange={handleChange} disabled={saving} />
      )}

      {/* Structured strip types can also be filled from a pasted readback. */}
      {selected.definition.output_format === 'rri_strip' && pasteBox}

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
