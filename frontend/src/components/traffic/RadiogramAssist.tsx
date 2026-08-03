import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, IconButton, Popover, TextField, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import FormRenderer from './FormRenderer';
import ArlMessagePicker from './ArlMessagePicker';
import HxCodeField from './HxCodeField';
import { FormDefinition } from '../../hooks/useFormDefinitions';
import { useAuth } from '../../contexts/AuthContext';
import { useNtsAssist } from '../../hooks/useNtsAssist';

// ========== RadiogramAssist ==========
// The radiogram-specific assist layer wrapping the generic FormRenderer --
// composes around it rather than forking it (FormRenderer stays the single
// generic renderer every other form type uses). Adds, per
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 4.3:
//   - a live NTS normalization preview + check (word count) under "text"
//   - an "Insert ARL Message" entry point (ArlMessagePicker)
//   - a tap-friendly help popover on "handling" (HX codes), rendering the
//     definition's own help_text rather than a hardcoded copy of the codes
//   - auto-fill for station_of_origin / place_of_origin / signature / filed_time
//
// Same props shape as FormRenderer so it drops in wherever FormRenderer was
// used for RADIOGRAM (see pages/Traffic.tsx).

interface RadiogramAssistProps {
  definition: FormDefinition;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

// Only the %H / %M tokens are ever used (radiogram.json's filed_time uses
// "%H%M"), so this deliberately doesn't grow into a general strftime port.
function formatDefaultNow(pattern: string): string {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return pattern.replace('%H', hh).replace('%M', mm);
}

interface AutoFillUser {
  callsign?: string;
  location?: string;
  name?: string;
}

// Maps a field's auto_fill key (radiogram.json) to the logged-in user's
// profile. Keep in sync with the auto_fill values used there: "callsign"
// (station_of_origin), "place_of_origin" (place_of_origin), "signature"
// (signature).
function autoFillValueFor(key: string, user: AutoFillUser | null): string | undefined {
  if (!user) return undefined;
  switch (key) {
    case 'callsign':
      return user.callsign;
    case 'place_of_origin':
      return user.location;
    case 'signature':
      return user.name;
    default:
      return undefined;
  }
}

const RadiogramAssist: React.FC<RadiogramAssistProps> = ({ definition, values, onChange, errors, disabled }) => {
  const { user } = useAuth();
  const didAutoFill = useRef(false);

  const textField = definition.fields.find((f) => f.name === 'text');
  const handlingField = definition.fields.find((f) => f.name === 'handling');
  // Every field except "text" and "handling" still renders through the
  // generic FormRenderer unchanged -- those two get custom controls below
  // with the NTS/ARL and HX-help assists wired in.
  const genericFields = definition.fields.filter((f) => f.name !== 'text' && f.name !== 'handling');
  const genericDefinition: FormDefinition = { ...definition, fields: genericFields };

  // ========== AUTO-FILL ==========
  // Runs once on mount. Only fills fields that are still blank, and only
  // once -- an operator who deliberately clears an auto-filled field (e.g.
  // relaying on behalf of someone else) must not have it silently
  // repopulated behind their back on a later render.
  useEffect(() => {
    if (didAutoFill.current) return;
    didAutoFill.current = true;
    definition.fields.forEach((field) => {
      if (values[field.name]) return;
      if (field.auto_fill) {
        const filled = autoFillValueFor(field.auto_fill, user ?? null);
        if (filled) onChange(field.name, filled);
      } else if (field.default_now) {
        onChange(field.name, formatDefaultNow(field.default_now));
      }
    });
    // Deliberately runs once on mount only -- see didAutoFill guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [arlOpen, setArlOpen] = useState(false);
  const [hxAnchor, setHxAnchor] = useState<HTMLElement | null>(null);

  const textValue = values.text ?? '';
  const { normalized, check } = useNtsAssist(textValue);

  const handleInsertArl = (text: string) => {
    const current = values.text ?? '';
    onChange('text', current ? `${current} ${text}` : text);
    setArlOpen(false);
  };

  return (
    <Box>
      <FormRenderer definition={genericDefinition} values={values} onChange={onChange} errors={errors} disabled={disabled} />

      {/* ========== HANDLING (HX) FIELD -- fixed set of 7 codes, so a dropdown, never free text ========== */}
      {handlingField && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Box sx={{ flexGrow: 1 }}>
            <HxCodeField
              label={handlingField.label}
              value={values.handling ?? ''}
              onChange={(v) => onChange('handling', v)}
              disabled={disabled}
              required={handlingField.is_required}
              error={errors?.handling}
            />
          </Box>
          {handlingField.help_text && (
            <>
              <IconButton
                aria-label="HX handling code help"
                onClick={(e) => setHxAnchor(e.currentTarget)}
                sx={{ mt: 1, minWidth: 44, minHeight: 44 }}
              >
                <HelpOutlineIcon />
              </IconButton>
              <Popover
                open={Boolean(hxAnchor)}
                anchorEl={hxAnchor}
                onClose={() => setHxAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              >
                <Box sx={{ p: 2, maxWidth: 360 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>HX Handling Instructions</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{handlingField.help_text}</Typography>
                </Box>
              </Popover>
            </>
          )}
        </Box>
      )}

      {/* ========== MESSAGE TEXT FIELD WITH LIVE NTS ASSIST ========== */}
      {textField && (
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={4}
            label={textField.label}
            required={textField.is_required}
            value={textValue}
            disabled={disabled}
            error={Boolean(errors?.text)}
            helperText={errors?.text || textField.description || undefined}
            onChange={(e) => onChange('text', e.target.value)}
          />
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {/* The server always recomputes this on submit -- this chip is a
                preview only, per TRAFFIC-HANDLING-DESIGN.md section 3.2. */}
            <Chip label={`Check: ${check}`} />
            <Button
              variant="outlined"
              startIcon={<PlaylistAddIcon />}
              onClick={() => setArlOpen(true)}
              disabled={disabled}
              sx={{ minHeight: 44 }}
            >
              Insert ARL Message
            </Button>
          </Box>
          {normalized && (
            <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" component="div">
                NTS-normalized preview
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {normalized}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <ArlMessagePicker open={arlOpen} onClose={() => setArlOpen(false)} onInsert={handleInsertArl} />
    </Box>
  );
};

export default RadiogramAssist;
