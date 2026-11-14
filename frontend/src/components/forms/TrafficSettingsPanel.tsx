import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { useFormDefinitions } from '../../hooks/useFormDefinitions';
import {
  acceptStripFormType,
  isNamedStripDefinition,
  rawStripFormType,
} from '../../utils/trafficStripSettings';

// ========== SHARED TRAFFIC SETTINGS ==========
// The "what traffic does this net take?" settings, used by both CreateNet
// and CreateSchedule through components/forms/NetFeaturesPanel.tsx, so the
// two never drift -- the same sharing pattern as
// CommunicationPlanPanel/AnnouncementsPanel in this folder.
//
// Split in two because they live in different sections of the form:
//   TrafficHandlingSettings  (General Net Features)
//     traffic_enabled        reveals the Traffic toolbar button + panel on the
//                            net (NetViewHeader.tsx / NetViewSidePanels.tsx)
//     traffic_form_types     which types the pickers offer; empty = all of them.
//                            Filters only -- the API still accepts an off-list
//                            type so unusual traffic is never rejected mid-net.
//   StripSettings            (SKYWARN Features)
//     strip type / template  for an RRI or SKYWARN net: either point at a
//                            defined strip type (named fields) or paste the
//                            originating strip verbatim (positional fields).
//                            Both are supported because a net may be running
//                            a one-off drill nobody wants to formalize.
//
// Both read one useFormDefinitions() result, passed in by the parent, so a
// strip type defined in the SKYWARN section shows up in the traffic list
// straight away.
//
// Strips are filed as traffic, so choosing a strip type, pasting an
// originating strip, or defining a new type turns traffic handling on and
// adds the form type it files to the accepted list
// (utils/trafficStripSettings.ts::acceptStripFormType). The controls stay
// usable while traffic is off; that is how a SKYWARN net manager gets
// traffic handling without first looking for it under General (Brad,
// 2026-11-14: "Choosing a strip turns on Assisted Traffic Handling").
//
// The paste box doubles as the entry point for defining a reusable type: Parse
// splits it into tokens, and labeling them promotes it via
// POST /traffic/strip-templates with file_first_form=false (define the type,
// don't file a form of placeholder values).

export type FormDefinitionsState = ReturnType<typeof useFormDefinitions>;

// Field names match both form contexts (CreateNetContext / CreateScheduleContext)
export interface TrafficSettingsFields {
  trafficEnabled: boolean;
  setTrafficEnabled: (v: boolean) => void;
  trafficFormTypes: string[];
  setTrafficFormTypes: (v: string[]) => void;
  trafficStripFormType: string;
  setTrafficStripFormType: (v: string) => void;
  trafficStripTemplate: string;
  setTrafficStripTemplate: (v: string) => void;
}

interface TrafficSettingsProps {
  fields: TrafficSettingsFields;
  formDefinitions: FormDefinitionsState;
  // "net" vs "schedule" only changes wording -- the settings are identical.
  scope?: 'net' | 'schedule';
}

interface DefineToken {
  value: string;
  starts_new_section: boolean;
  label: string;
}

// ========== TRAFFIC HANDLING (General Net Features) ==========
export const TrafficHandlingSettings: React.FC<TrafficSettingsProps> = ({
  fields,
  formDefinitions,
  scope = 'net',
}) => {
  const { trafficEnabled, setTrafficEnabled, trafficFormTypes, setTrafficFormTypes } = fields;
  const { definitions, loading } = formDefinitions;
  const noun = scope === 'schedule' ? 'nets from this schedule' : 'this net';

  const handleToggleFormType = (formType: string) => {
    setTrafficFormTypes(
      trafficFormTypes.includes(formType)
        ? trafficFormTypes.filter((t) => t !== formType)
        : [...trafficFormTypes, formType]
    );
  };

  return (
    <>
      <Box sx={{ mt: 2 }}>
        <FormControlLabel
          control={<Switch checked={trafficEnabled} onChange={(e) => setTrafficEnabled(e.target.checked)} />}
          label="Enable Assisted Traffic Handling"
        />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4.5 }}>
          Adds a Traffic button to the net toolbar for NCS, Logger, and the net manager, opening a
          panel that lists traffic passed on {noun} and lets staff file and hand off messages.
        </Typography>
      </Box>

      {/* ========== Shown only when traffic handling is on ========== */}
      {trafficEnabled && (
        <Box sx={{ ml: 4.5, mt: 2 }}>
          {loading ? (
            <CircularProgress size={20} />
          ) : (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Traffic this net takes
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Leave everything unchecked to offer every form type. Checking a few narrows what
                staff see when filing, without blocking anything unusual that comes up on the air.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {definitions.map((d) => (
                  <FormControlLabel
                    key={d.form_type}
                    control={
                      <Checkbox
                        size="small"
                        checked={trafficFormTypes.includes(d.form_type)}
                        onChange={() => handleToggleFormType(d.form_type)}
                      />
                    }
                    label={<Typography variant="body2">{d.title}</Typography>}
                  />
                ))}
              </Box>
            </>
          )}
        </Box>
      )}
    </>
  );
};

// ========== RRI / WEATHER STRIP FIELDS (SKYWARN Features) ==========
export const StripSettings: React.FC<TrafficSettingsProps> = ({ fields, formDefinitions }) => {
  const {
    trafficEnabled,
    setTrafficEnabled,
    trafficFormTypes,
    setTrafficFormTypes,
    trafficStripFormType,
    setTrafficStripFormType,
    trafficStripTemplate,
    setTrafficStripTemplate,
  } = fields;
  const { definitions, loading, reload } = formDefinitions;
  // A strip set up while traffic handling is off isn't offered to staff.
  const stripConfigured = Boolean(trafficStripFormType || trafficStripTemplate.trim());

  // ---- "Define a new strip type from the pasted example" sub-flow ----
  const [defineOpen, setDefineOpen] = useState(false);
  const [defineTokens, setDefineTokens] = useState<DefineToken[]>([]);
  const [defineFormType, setDefineFormType] = useState('');
  const [defineTitle, setDefineTitle] = useState('');
  const [defineBusy, setDefineBusy] = useState(false);
  const [defineError, setDefineError] = useState<string | null>(null);

  // ---- Live validation of the pasted origin strip ----
  // tokenize_strip only ever raises on truly empty/oversized input -- any
  // other text "succeeds" even with zero delimiters, silently producing zero
  // fields (the whole string becomes the suggested form_type, nothing else).
  // That's the actual failure mode worth catching before save: a strip typed
  // or pasted without "/" separators looks fine here and then renders no
  // fields at all when someone goes to answer it. Debounced so every
  // keystroke doesn't fire a request.
  const [stripValidation, setStripValidation] = useState<
    { status: 'ok'; count: number } | { status: 'warning'; message: string } | { status: 'error'; message: string } | null
  >(null);

  useEffect(() => {
    if (!trafficStripTemplate.trim()) {
      setStripValidation(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      trafficApi.tokenizeStripTemplate(trafficStripTemplate)
        .then((resp) => {
          if (cancelled) return;
          const count = resp.data.tokens.length;
          if (count === 0) {
            setStripValidation({
              status: 'warning',
              message: 'No fields found -- this strip has no "/" separators, so answering it would show no fields at all. Check for missing slashes.',
            });
          } else if (count === 1) {
            setStripValidation({
              status: 'warning',
              message: 'Only 1 field found. If this strip is meant to have more, check that every value is separated by "/".',
            });
          } else {
            setStripValidation({ status: 'ok', count });
          }
        })
        .catch((err) => {
          if (!cancelled) setStripValidation({ status: 'error', message: getErrorMessage(err, 'Could not read this text') });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trafficStripTemplate]);

  // Strips are filed as traffic: setting one up turns traffic handling on,
  // and puts the form type it files as on the accepted list, so choosing a
  // strip and allowing it aren't two chores. Traffic goes on even when no
  // form type is known (an instance with the raw catch-all disabled). An
  // empty list (every type) is left alone -- see acceptStripFormType.
  const applyStrip = (formType: string | null) => {
    if (!trafficEnabled) setTrafficEnabled(true);
    const next = acceptStripFormType(trafficFormTypes, formType);
    if (next !== trafficFormTypes) setTrafficFormTypes(next);
  };

  const handleStripTypeChange = (formType: string) => {
    setTrafficStripFormType(formType);
    // "None" (empty) chooses no strip, so it changes nothing else.
    if (formType) applyStrip(formType);
  };

  // A pasted strip is filed as the raw catch-all, and is only used when no
  // named strip type is chosen (TrafficComposer.tsx::effectiveStripTemplate).
  const handleStripTemplateChange = (text: string) => {
    setTrafficStripTemplate(text);
    if (text.trim() && !trafficStripFormType) applyStrip(rawStripFormType(definitions));
  };

  // Parse the pasted strip into one labelable row per token. Stateless on the
  // server (same D5 shape as the Import tab's preview) -- nothing is saved
  // until "Save as a reusable type" below.
  const handleParseTemplate = async () => {
    setDefineBusy(true);
    setDefineError(null);
    try {
      const resp = await trafficApi.tokenizeStripTemplate(trafficStripTemplate);
      if (resp.data.tokens.length === 0) {
        // tokenize_strip only raises on empty/oversized input -- text with
        // no "/" separators "succeeds" with zero fields, which would leave
        // this screen with nothing to label. Catch it here instead.
        setDefineError('No fields found in this strip -- check that values are separated by "/" before naming them.');
        return;
      }
      setDefineTokens(
        resp.data.tokens.map((t: any) => ({
          value: t.value,
          starts_new_section: t.starts_new_section,
          label: '',
        }))
      );
      setDefineFormType(resp.data.suggested_form_type || '');
      setDefineTitle('');
      setDefineOpen(true);
    } catch (err) {
      setDefineError(getErrorMessage(err, 'Could not read that as an RRI strip'));
    } finally {
      setDefineBusy(false);
    }
  };

  const handleDefineSubmit = async () => {
    setDefineBusy(true);
    setDefineError(null);
    try {
      const resp = await trafficApi.createStripTemplate({
        form_type: defineFormType,
        title: defineTitle,
        // Defining the type up front, not filing a report -- see the
        // file_first_form note in traffic_strip_templates.py.
        file_first_form: false,
        fields: defineTokens.map((t) => ({
          label: t.label,
          starts_new_section: t.starts_new_section,
          value: t.value,
        })),
      });
      const created = resp.data.definition;
      reload();
      // Point the net at what was just defined, and add it to the accepted
      // list so enabling the type and allowing it aren't two separate chores.
      setTrafficStripFormType(created.form_type);
      applyStrip(created.form_type);
      setDefineOpen(false);
      setDefineTokens([]);
    } catch (err) {
      setDefineError(getErrorMessage(err, 'Failed to define this strip type'));
    } finally {
      setDefineBusy(false);
    }
  };

  // The "Strip type" dropdown uses the narrower filter -- see
  // isNamedStripDefinition's comment in utils/trafficStripSettings.ts.
  const namedStripDefinitions = definitions.filter(isNamedStripDefinition);

  if (loading) return <CircularProgress size={20} />;

  return (
    <>
      <Typography variant="subtitle2" gutterBottom>
        RRI / weather strip fields
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        On an RRI net or drill, every station answers the same originating strip. Pick
        an already-defined strip type staff should collect (its own fields show when
        filing), or paste the originating strip below to lay out its fields for staff --
        labeling those fields there is what turns it into a pickable type here.
      </Typography>

      {/* Shows while traffic handling is off. With a strip already set up
          (traffic was switched off afterwards) it warns that the strip isn't
          used; otherwise it says choosing one switches traffic on. */}
      {!trafficEnabled && (
        <Typography variant="caption" color={stripConfigured ? 'warning.main' : 'text.secondary'} display="block" sx={{ mb: 1.5 }}>
          {stripConfigured
            ? 'Assisted Traffic Handling is off, so staff are not offered this strip. Turn it on under General Net Features.'
            : 'Strips are filed as traffic, so choosing or pasting one turns on Assisted Traffic Handling.'}
        </Typography>
      )}

      <FormControl size="small" sx={{ minWidth: 260, maxWidth: '100%', mb: 2 }}>
        <InputLabel id="traffic-strip-type-label">Strip type</InputLabel>
        <Select
          labelId="traffic-strip-type-label"
          label="Strip type"
          value={trafficStripFormType}
          onChange={(e) => handleStripTypeChange(e.target.value)}
        >
          <MenuItem value="">
            <em>None -- use the pasted strip below</em>
          </MenuItem>
          {namedStripDefinitions.map((d) => (
            <MenuItem key={d.form_type} value={d.form_type}>
              {d.title}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        multiline
        rows={2}
        size="small"
        label="Originating strip (optional)"
        value={trafficStripTemplate}
        onChange={(e) => handleStripTemplateChange(e.target.value)}
        placeholder="SITREP/04-08-2026/1830/PORTLAND ME/BRIDGE OUT ON RT 4//"
        helperText="Stored as-is so staff get the same fields in the same order. Parse it to name the fields and reuse them on future nets."
        sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
      />

      {/* Live syntax feedback -- not a save-blocker (the field is
          optional and a warning may be a false positive on an
          unusual strip), just a heads-up before the net relies
          on it. */}
      {stripValidation?.status === 'ok' && (
        <Typography variant="caption" color="success.main" display="block" sx={{ mt: 0.5 }}>
          {stripValidation.count} field{stripValidation.count === 1 ? '' : 's'} recognized.
        </Typography>
      )}
      {stripValidation?.status === 'warning' && (
        <Alert severity="warning" sx={{ mt: 1 }}>{stripValidation.message}</Alert>
      )}
      {stripValidation?.status === 'error' && (
        <Alert severity="error" sx={{ mt: 1 }}>{stripValidation.message}</Alert>
      )}

      {defineError && <Alert severity="error" sx={{ mt: 1 }}>{defineError}</Alert>}

      {!defineOpen && (
        <Button
          type="button"
          size="small"
          sx={{ mt: 1, minHeight: 44 }}
          disabled={!trafficStripTemplate.trim() || defineBusy}
          onClick={handleParseTemplate}
        >
          {defineBusy ? 'Parsing...' : 'Parse and name the fields'}
        </Button>
      )}

      {/* ========== Name each field, then save as a reusable type ========== */}
      {defineOpen && (
        <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Name each field so answering stations know what to enter. This creates a
            strip type you can reuse on any future net.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <TextField
              size="small"
              label="Strip type code"
              value={defineFormType}
              onChange={(e) => setDefineFormType(e.target.value)}
              placeholder="SITREP"
              sx={{ width: 200 }}
            />
            <TextField
              size="small"
              label="Title"
              value={defineTitle}
              onChange={(e) => setDefineTitle(e.target.value)}
              placeholder="Situation Report"
              sx={{ width: 260, maxWidth: '100%' }}
            />
          </Box>

          {defineTokens.map((token, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 160 }}>
                {token.value}
              </Typography>
              <TextField
                size="small"
                label="Field name"
                value={token.label}
                onChange={(e) =>
                  setDefineTokens((prev) =>
                    prev.map((t, i) => (i === index ? { ...t, label: e.target.value } : t))
                  )
                }
                sx={{ width: 220 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={token.starts_new_section}
                    onChange={(e) =>
                      setDefineTokens((prev) =>
                        prev.map((t, i) =>
                          i === index ? { ...t, starts_new_section: e.target.checked } : t
                        )
                      )
                    }
                  />
                }
                label={<Typography variant="caption">Starts a new section</Typography>}
              />
            </Box>
          ))}

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              type="button"
              variant="contained"
              size="small"
              sx={{ minHeight: 44 }}
              disabled={
                defineBusy ||
                !defineFormType.trim() ||
                !defineTitle.trim() ||
                defineTokens.some((t) => !t.label.trim())
              }
              onClick={handleDefineSubmit}
            >
              {defineBusy ? 'Saving...' : 'Save as a reusable type'}
            </Button>
            <Button
              type="button"
              size="small"
              sx={{ minHeight: 44 }}
              onClick={() => {
                setDefineOpen(false);
                setDefineError(null);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
};
