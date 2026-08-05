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
import { composeStripText, splitStripText, StripSlot } from '../../utils/rriStrip';
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

  // ---- The full strip, shown alongside the fields (strip types only) ----
  // Two ways into the same message: fill the fields and watch the strip
  // build itself, or paste the strip as a station read it over the air. The
  // box is always visible so both are equally obvious.
  //
  // Null means "showing the strip composed from the fields above"; a string
  // means the operator typed or pasted over it, and that text wins until
  // they fill the fields from it or edit a field again.
  const [stripOverride, setStripOverride] = useState<string | null>(null);
  const [stripWarnings, setStripWarnings] = useState<string[]>([]);

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
  const optionKeys = options.map((o) => o.key).join('|');
  useEffect(() => {
    // The option list changes shape once the net's origin strip finishes
    // tokenizing (the synthetic strip option replaces the raw catch-all), so
    // a key chosen before that lands can go stale. Re-resolve on every change
    // rather than only when nothing is selected, or the dialog falls back to
    // the picker with a single card the operator has to click anyway.
    const stillValid = selectedKey !== null && options.some((o) => o.key === selectedKey);
    if (stillValid) return;
    setSelectedKey(autoSelected ? options[0].key : null);
    // optionKeys (not `options`) as the dep: the array is rebuilt every
    // render, so depending on it directly would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKeys, autoSelected, selectedKey]);

  const selected = options.find((o) => o.key === selectedKey) ?? null;

  // ========== THE SELECTED OPTION'S WIRE LAYOUT ==========
  // Non-null only for something that goes on the air as an RRI strip -- a
  // Radiogram or ICS-213 has no strip box at all. Keyword and section breaks
  // come from the backend (FormDefinition.strip_keyword /
  // fields[].starts_new_section, both filled by rri_strip.strip_layout), so
  // the text built here is the text format_rri_strip() would produce.
  const stripLayout: { keyword: string; slots: StripSlot[]; uppercase: boolean } | null = (() => {
    if (!selected) return null;
    if (selected.kind === 'netStrip') {
      return {
        keyword: selected.keyword,
        slots: selected.tokens.map((t) => ({ name: t.value, startsNewSection: t.starts_new_section })),
        // A net's raw origin strip is filed verbatim as RRI_STRIP_OTHER
        // text, so it is not upper-cased on the way in the way a defined
        // type's values are.
        uppercase: false,
      };
    }
    if (selected.definition.output_format !== 'rri_strip') return null;
    const ordered = [...selected.definition.fields].sort((a, b) => a.sort_order - b.sort_order);
    return {
      keyword: selected.definition.strip_keyword || selected.definition.form_type,
      slots: ordered.map((f) => ({ name: f.name, startsNewSection: f.starts_new_section })),
      uppercase: true,
    };
  })();

  // The values that feed the strip, in field order, from whichever half of
  // the composer the selected option uses.
  const stripSlotValues: string[] = stripLayout
    ? (selected?.kind === 'netStrip'
      ? stripLayout.slots.map((_slot, index) => stripValues[index] ?? '')
      : stripLayout.slots.map((slot) => values[slot.name] ?? ''))
    : [];

  const composedStripText = stripLayout
    ? composeStripText(stripLayout.keyword, stripLayout.slots, stripSlotValues, stripLayout.uppercase)
    : '';
  const stripText = stripOverride ?? composedStripText;

  // Editing a field puts the strip box back under the fields' control --
  // otherwise it would sit there showing a pasted strip that no longer
  // matches what is about to be filed.
  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setStripOverride(null);
    setStripWarnings([]);
  };

  const handleStripValueChange = (index: number, value: string) => {
    setStripValues((prev) => prev.map((v, i) => (i === index ? value : v)));
    setStripOverride(null);
    setStripWarnings([]);
  };

  const resetAfterCreate = () => {
    setValues({});
    setStripValues((netStripTokens || []).map(() => ''));
    setStripCallSign('');
    setStripLabel('');
    setStripOverride(null);
    setStripWarnings([]);
    // Keep the single auto-selected option selected; otherwise return to the
    // picker so the next item can be a different type.
    if (!autoSelected) setSelectedKey(null);
  };

  // Splits the strip in the box back across the fields above, positionally,
  // preserving blanks so an unanswered field mid-strip doesn't shift every
  // later value onto the wrong label.
  const handleFillFieldsFromStrip = () => {
    if (!stripLayout || !selected) return;
    const { values: parsed, warnings } = splitStripText(stripText, stripLayout.keyword, stripLayout.slots);
    if (selected.kind === 'netStrip') {
      setStripValues(parsed);
    } else {
      setValues((prev) => {
        const next = { ...prev };
        stripLayout.slots.forEach((slot, index) => { next[slot.name] = parsed[index]; });
        return next;
      });
    }
    setStripWarnings(warnings);
    // Back under the fields' control, so the box now shows the canonical
    // rendering of what was just filled in.
    setStripOverride(null);
  };

  const handleSubmit = async () => {
    if (!selected || selected.kind !== 'definition') return;
    setSaving(true);
    setError(null);
    try {
      // A strip pasted but never pushed into the fields still files -- the
      // box is an equal way in, not a staging area the operator can forget
      // to apply.
      let fieldValues = values;
      if (stripLayout && stripOverride !== null && stripOverride.trim()) {
        const { values: parsed } = splitStripText(stripOverride, stripLayout.keyword, stripLayout.slots);
        fieldValues = { ...values };
        stripLayout.slots.forEach((slot, index) => { fieldValues[slot.name] = parsed[index]; });
      }
      const resp = await trafficApi.create({
        form_type: selected.definition.form_type,
        net_id: netId,
        field_values: fieldValues,
      });
      onCreated(resp.data.id);
      resetAfterCreate();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create this traffic item'));
    } finally {
      setSaving(false);
    }
  };

  // Files the net's origin-strip answer as a general RRI strip. Whatever the
  // strip box shows is what gets stored: normally the canonical string
  // composed from the fields above (keyword, each value in order, an empty
  // token at every "/ /" section break), or a pasted strip verbatim, since
  // preserving text exactly as sent is the whole point of the catch-all type.
  const handleSubmitStrip = async () => {
    if (!selected || selected.kind !== 'netStrip') return;
    setSaving(true);
    setError(null);
    try {
      const resp = await trafficApi.create({
        form_type: 'RRI_STRIP_OTHER',
        net_id: netId,
        field_values: {
          subject: stripLabel.trim() || `${selected.keyword || 'Strip'} from ${stripCallSign.trim().toUpperCase()}`,
          call_sign: stripCallSign.trim().toUpperCase(),
          strip_text: stripText,
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

  // ========== FULL STRIP BOX ==========
  // Always visible for anything that goes on the air as a strip, because it
  // is a second, equal way to enter the same message -- not an optional
  // extra hidden behind a link. Typing in the fields above rewrites it live;
  // pasting into it and pressing "Fill fields above" goes the other way.
  const stripBox = stripLayout && (
    <Box sx={{ mt: 3, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {stripWarnings.map((warning, index) => (
        <Alert key={index} severity="warning" sx={{ mb: 1 }}>{warning}</Alert>
      ))}
      <TextField
        fullWidth
        multiline
        minRows={2}
        size="small"
        label="Full strip"
        helperText={
          selected.kind === 'netStrip'
            ? 'Built from the fields above as you type. You can also paste the strip exactly as it was sent and log it as-is, or press "Fill fields above" to split it into the fields.'
            : 'Built from the fields above as you type. You can also paste the strip exactly as it was sent -- it is split back into the fields when you file it, or now with "Fill fields above".'
        }
        value={stripText}
        onChange={(e) => { setStripOverride(e.target.value); setStripWarnings([]); }}
        sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        <Button
          type="button"
          variant="outlined"
          size="small"
          disabled={!stripText.replace(/[/ ]/g, '').trim()}
          onClick={handleFillFieldsFromStrip}
          sx={{ minHeight: 44 }}
        >
          Fill fields above
        </Button>
        {/* Only meaningful while the box is holding text of its own. */}
        {stripOverride !== null && (
          <Button
            type="button"
            size="small"
            onClick={() => { setStripOverride(null); setStripWarnings([]); }}
            sx={{ minHeight: 44 }}
          >
            Rebuild from fields
          </Button>
        )}
      </Box>
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
            onChange={(e) => handleStripValueChange(index, e.target.value)}
          />
        ))}

        {stripBox}

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleSubmitStrip}
            // Either half of the composer can carry the content: the fields,
            // or a strip pasted straight into the box.
            disabled={saving || !stripCallSign.trim() || (stripValues.every((v) => !v.trim()) && stripOverride === null)}
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

      {/* Strip types show their wire text alongside the fields, either of
          which the operator may use. Radiogram/ICS-213 have no strip form. */}
      {stripBox}

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
