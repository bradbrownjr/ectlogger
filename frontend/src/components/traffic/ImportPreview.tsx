import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import { trafficApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { FormDefinition } from '../../hooks/useFormDefinitions';
import FormRenderer from './FormRenderer';
import RadiogramAssist from './RadiogramAssist';

// ========== ImportPreview ==========
// Paste box -> Parse -> review screen -> Confirm into the ordinary
// renderer, pre-filled. Stateless on the server (POST /traffic/import/preview
// never writes) -- the only thing that ever commits is the same
// POST /traffic/forms the "New" tab already uses. See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md D5 and section 4.3.

interface ImportField {
  value: string | number | null;
  source: 'bt_block' | 'heuristic' | 'label_match' | 'unparsed';
  confidence: 'high' | 'low';
}

interface ImportResult {
  form_type: string;
  fields: Record<string, ImportField>;
  check_stated: number | null;
  check_count: number | null;
  warnings: string[];
  unparsed_lines: string[];
  raw_text?: string | null;
}

interface ImportPreviewProps {
  definitions: FormDefinition[];
  onCreated: (id: number) => void;
  onGoToNewTab: () => void;
}

type Stage = 'paste' | 'review' | 'edit';

// A stated-vs-computed check mismatch is, per D5, "the single most valuable
// thing the importer can do" -- so it gets its own always-visible callout
// rather than being just another line in the warnings list.
function findCheckMismatchWarning(result: ImportResult): string | undefined {
  return result.warnings.find((w) => w.includes('does not match computed check'));
}

// Pre-fills FormRenderer/RadiogramAssist's values shape from the parse
// result. A light reshape for the UI only -- it does not touch what the
// server parsed, it just maps a bare "R" onto the matching "R - Routine"
// choice string so a choice-type field isn't left showing blank after a
// clean parse.
function valuesFromParseResult(definition: FormDefinition, result: ImportResult): Record<string, string> {
  const values: Record<string, string> = {};
  definition.fields.forEach((field) => {
    const parsed = result.fields[field.name];
    if (!parsed || parsed.value === null || parsed.value === undefined) return;
    const raw = String(parsed.value);
    if (field.field_type === 'choice' && field.choices) {
      const match = field.choices.find((choice) => choice === raw || choice.startsWith(`${raw} - `));
      values[field.name] = match ?? raw;
    } else {
      values[field.name] = raw;
    }
  });
  return values;
}

const ImportPreview: React.FC<ImportPreviewProps> = ({ definitions, onCreated, onGoToNewTab }) => {
  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const matchedDefinition = result
    ? definitions.find((d) => d.form_type === result.form_type) ?? null
    : null;

  const handleParse = async () => {
    setParsing(true);
    setParseError(null);
    try {
      const resp = await trafficApi.importPreview(text);
      setResult(resp.data);
      setStage('review');
    } catch (err) {
      setParseError(getErrorMessage(err, 'Could not parse this text'));
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = () => {
    if (!result || !matchedDefinition) return;
    setValues(valuesFromParseResult(matchedDefinition, result));
    setStage('edit');
  };

  const handleStartOver = () => {
    setStage('paste');
    setText('');
    setResult(null);
    setValues({});
    setParseError(null);
    setSaveError(null);
  };

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!matchedDefinition) return;
    setSaving(true);
    setSaveError(null);
    try {
      const resp = await trafficApi.create({ form_type: matchedDefinition.form_type, field_values: values });
      onCreated(resp.data.id);
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to create this traffic item'));
    } finally {
      setSaving(false);
    }
  };

  // ========== PASTE STAGE ==========
  if (stage === 'paste') {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste the plaintext of a radiogram or ICS-213 message as it was copied off the air, and
          the parser will fill in what it can. Nothing is saved until you review and confirm.
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={10}
          placeholder={'NR 123 R HXG KC1JMH 6 PORTLAND ME 1432 JAN 05\nJIM KUTSCH KY2D\n...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ fontFamily: 'monospace' }}
          inputProps={{ style: { fontFamily: 'monospace' } }}
        />
        {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={parsing ? <CircularProgress size={16} color="inherit" /> : <ContentPasteIcon />}
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            sx={{ minHeight: 44 }}
          >
            {parsing ? 'Parsing...' : 'Parse'}
          </Button>
        </Box>
      </Box>
    );
  }

  // ========== REVIEW STAGE ==========
  if (stage === 'review' && result) {
    const checkMismatch = findCheckMismatchWarning(result);
    const otherWarnings = result.warnings.filter((w) => w !== checkMismatch);

    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={handleStartOver} sx={{ mb: 2, minHeight: 44 }}>
          Start over
        </Button>

        {result.form_type === 'unknown' ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Could not recognize this as a radiogram or ICS-213 message. Nothing was lost — your
            original text is preserved below. You can enter it manually on the New tab instead.
          </Alert>
        ) : (
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Detected: {matchedDefinition?.title ?? result.form_type}
          </Typography>
        )}

        {/* ========== CHECK MISMATCH: always the most prominent warning ========== */}
        {checkMismatch && (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            {checkMismatch}
          </Alert>
        )}

        {otherWarnings.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" component="div" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              The parser made some assumptions:
            </Typography>
            {otherWarnings.map((w, i) => (
              <Typography key={i} variant="body2">{w}</Typography>
            ))}
          </Alert>
        )}

        {Object.keys(result.fields).length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Parsed fields</Typography>
            {Object.entries(result.fields).map(([name, field]) => (
              <Box
                key={name}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  py: 1,
                  borderLeft: 3,
                  borderColor: field.confidence === 'high' ? 'success.main' : 'warning.main',
                  pl: 1.5,
                  mb: 1,
                }}
              >
                <Tooltip title={field.confidence === 'high' ? 'High confidence' : 'Low confidence — verify this field'}>
                  {field.confidence === 'high' ? (
                    <CheckCircleIcon color="success" fontSize="small" sx={{ mt: 0.3 }} />
                  ) : (
                    <WarningAmberIcon color="warning" fontSize="small" sx={{ mt: 0.3 }} />
                  )}
                </Tooltip>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{name}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {field.value === null || field.value === '' ? '(not found)' : String(field.value)}
                  </Typography>
                </Box>
                <Chip label={field.source} size="small" variant="outlined" />
              </Box>
            ))}
          </Paper>
        )}

        {result.unparsed_lines.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Unparsed lines</Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {result.unparsed_lines.join('\n')}
            </Box>
          </Paper>
        )}

        {result.form_type === 'unknown' && result.raw_text && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Your original text</Typography>
            <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {result.raw_text}
            </Box>
          </Paper>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          {result.form_type === 'unknown' || !matchedDefinition ? (
            <Button variant="contained" onClick={onGoToNewTab} sx={{ minHeight: 44 }}>
              Enter manually on New tab
            </Button>
          ) : (
            <Button variant="contained" color="primary" onClick={handleConfirm} sx={{ minHeight: 44 }}>
              Confirm and review fields
            </Button>
          )}
        </Box>
      </Box>
    );
  }

  // ========== EDIT STAGE ==========
  // Same renderer, same submit path as the New tab -- the only difference is
  // that `values` arrives pre-filled from the parse instead of empty.
  if (stage === 'edit' && matchedDefinition) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => setStage('review')} sx={{ mb: 2, minHeight: 44 }}>
          Back to parse review
        </Button>
        <Typography variant="h6" sx={{ mb: 2 }}>{matchedDefinition.title}</Typography>
        {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
        {matchedDefinition.form_type === 'RADIOGRAM' ? (
          <RadiogramAssist definition={matchedDefinition} values={values} onChange={handleChange} disabled={saving} />
        ) : (
          <FormRenderer definition={matchedDefinition} values={values} onChange={handleChange} disabled={saving} />
        )}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
            onClick={handleSubmit}
            disabled={saving}
            sx={{ minHeight: 44 }}
          >
            {saving ? 'Saving...' : 'Create'}
          </Button>
        </Box>
      </Box>
    );
  }

  return null;
};

export default ImportPreview;
