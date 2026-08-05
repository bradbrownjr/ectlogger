import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
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
import { useFormDefinitions, FormDefinition } from '../../hooks/useFormDefinitions';

// ========== SHARED TRAFFIC SETTINGS PANEL ==========
// The "what traffic does this net take?" block, used by both CreateNet
// (create-net/BasicInfoTab.tsx) and CreateSchedule
// (create-schedule/BasicInfoTab.tsx) so the two never drift -- the same
// sharing pattern as CommunicationPlanPanel/AnnouncementsPanel in this folder.
//
// Three settings, all optional:
//   traffic_enabled          reveals the Traffic toolbar button + panel on the
//                            net (NetViewHeader.tsx / NetViewSidePanels.tsx)
//   traffic_form_types       which types the pickers offer; empty = all of them.
//                            Filters only -- the API still accepts an off-list
//                            type so unusual traffic is never rejected mid-net.
//   strip type / template    for an RRI or SKYWARN net: either point at a
//                            defined strip type (named fields) or paste the
//                            originating strip verbatim (positional fields).
//                            Both are supported because a net may be running
//                            a one-off drill nobody wants to formalize.
//
// The paste box doubles as the entry point for defining a reusable type: Parse
// splits it into tokens, and labeling them promotes it via
// POST /traffic/strip-templates with file_first_form=false (define the type,
// don't file a form of placeholder values).

// Strip types are exactly the definitions the backend renders in RRI's
// slash-delimited form -- checking output_format instead of a hardcoded
// form_type list is what lets a type defined at runtime appear here with no
// further change (same rule TrafficDetail.tsx's print view uses).
const isStripDefinition = (d: FormDefinition) =>
  d.output_format === 'rri_strip' || d.output_format === 'rri_strip_raw';

interface DefineToken {
  value: string;
  starts_new_section: boolean;
  label: string;
}

interface TrafficSettingsPanelProps {
  trafficEnabled: boolean;
  setTrafficEnabled: (v: boolean) => void;
  trafficFormTypes: string[];
  setTrafficFormTypes: (v: string[]) => void;
  trafficStripFormType: string;
  setTrafficStripFormType: (v: string) => void;
  trafficStripTemplate: string;
  setTrafficStripTemplate: (v: string) => void;
  // "net" vs "schedule" only changes wording -- the settings are identical.
  scope?: 'net' | 'schedule';
}

const TrafficSettingsPanel: React.FC<TrafficSettingsPanelProps> = ({
  trafficEnabled,
  setTrafficEnabled,
  trafficFormTypes,
  setTrafficFormTypes,
  trafficStripFormType,
  setTrafficStripFormType,
  trafficStripTemplate,
  setTrafficStripTemplate,
  scope = 'net',
}) => {
  const { definitions, loading, reload } = useFormDefinitions();
  const noun = scope === 'schedule' ? 'nets from this schedule' : 'this net';

  // ---- "Define a new strip type from the pasted example" sub-flow ----
  const [defineOpen, setDefineOpen] = useState(false);
  const [defineTokens, setDefineTokens] = useState<DefineToken[]>([]);
  const [defineFormType, setDefineFormType] = useState('');
  const [defineTitle, setDefineTitle] = useState('');
  const [defineBusy, setDefineBusy] = useState(false);
  const [defineError, setDefineError] = useState<string | null>(null);

  const handleToggleFormType = (formType: string) => {
    setTrafficFormTypes(
      trafficFormTypes.includes(formType)
        ? trafficFormTypes.filter((t) => t !== formType)
        : [...trafficFormTypes, formType]
    );
  };

  // Parse the pasted strip into one labelable row per token. Stateless on the
  // server (same D5 shape as the Import tab's preview) -- nothing is saved
  // until "Save as a reusable type" below.
  const handleParseTemplate = async () => {
    setDefineBusy(true);
    setDefineError(null);
    try {
      const resp = await trafficApi.tokenizeStripTemplate(trafficStripTemplate);
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
      if (!trafficFormTypes.includes(created.form_type)) {
        setTrafficFormTypes([...trafficFormTypes, created.form_type]);
      }
      setDefineOpen(false);
      setDefineTokens([]);
    } catch (err) {
      setDefineError(getErrorMessage(err, 'Failed to define this strip type'));
    } finally {
      setDefineBusy(false);
    }
  };

  const stripDefinitions = definitions.filter(isStripDefinition);
  // Only surface the strip section once the net actually accepts a strip --
  // a Radiogram-only net has no use for it.
  const acceptsAStrip =
    trafficFormTypes.length === 0 || stripDefinitions.some((d) => trafficFormTypes.includes(d.form_type));

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

              {/* ========== RRI / WX strip template ========== */}
              {acceptsAStrip && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" gutterBottom>
                    RRI / weather strip fields
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                    On an RRI net or drill, every station answers the same originating strip. Pick
                    the strip type staff should collect, or paste the originating strip below so the
                    fields are laid out for them.
                  </Typography>

                  <FormControl size="small" sx={{ minWidth: 260, mb: 2 }}>
                    <InputLabel id="traffic-strip-type-label">Strip type</InputLabel>
                    <Select
                      labelId="traffic-strip-type-label"
                      label="Strip type"
                      value={trafficStripFormType}
                      onChange={(e) => setTrafficStripFormType(e.target.value)}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {stripDefinitions.map((d) => (
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
                    onChange={(e) => setTrafficStripTemplate(e.target.value)}
                    placeholder="SITREP/04-08-2026/1830/PORTLAND ME/BRIDGE OUT ON RT 4//"
                    helperText="Stored as-is so staff get the same fields in the same order. Parse it to name the fields and reuse them on future nets."
                    sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
                  />

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
                          sx={{ width: 260 }}
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
              )}
            </>
          )}
        </Box>
      )}
    </>
  );
};

export default TrafficSettingsPanel;
