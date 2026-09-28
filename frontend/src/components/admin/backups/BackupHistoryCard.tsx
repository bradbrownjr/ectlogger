import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import DownloadIcon from '@mui/icons-material/Download';
import VerifiedIcon from '@mui/icons-material/Verified';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { backupApi } from '../../../services/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { BackupRun, formatBytes, formatWhen } from './types';

interface Props {
  runs: BackupRun[];
  onChanged: () => void;
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const STATUS_CHIP: Record<BackupRun['status'], { label: string; color: 'success' | 'warning' | 'error' | 'info' }> = {
  success: { label: 'Succeeded', color: 'success' },
  partial: { label: 'Off-site copy failed', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
  running: { label: 'Running', color: 'info' },
};

// Text of a download's error body. Axios hands a blob-typed error back as a
// Blob, so the usual getErrorMessage cannot read its JSON detail directly.
const blobErrorMessage = async (err: any, fallback: string): Promise<string> => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).detail || fallback;
    } catch {
      return fallback;
    }
  }
  return getErrorMessage(err, fallback);
};

const BackupHistoryCard: React.FC<Props> = ({ runs, onChanged, showSnackbar }) => {
  const [verifyRun, setVerifyRun] = useState<BackupRun | null>(null);
  const [downloadRun, setDownloadRun] = useState<BackupRun | null>(null);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const openVerify = (run: BackupRun) => { setVerifyRun(run); setSecret(''); setDialogError(null); };
  const openDownload = (run: BackupRun) => { setDownloadRun(run); setSecret(''); setDialogError(null); };
  const closeDialogs = () => { if (!busy) { setVerifyRun(null); setDownloadRun(null); } };

  const handleVerify = async () => {
    if (!verifyRun) return;
    setBusy(true);
    setDialogError(null);
    try {
      const response = await backupApi.verify(verifyRun.id, secret);
      const result: BackupRun = response.data;
      if (result.verify_ok) {
        showSnackbar('Backup checked: every file matches and the database is intact', 'success');
        setVerifyRun(null);
      } else {
        setDialogError(result.verify_detail || 'The check failed.');
      }
      onChanged();
    } catch (err) {
      setDialogError(getErrorMessage(err, 'Could not check the backup'));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadRun?.filename) return;
    setBusy(true);
    setDialogError(null);
    try {
      const response = await backupApi.download(downloadRun.id, secret.trim());
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', downloadRun.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDownloadRun(null);
    } catch (err) {
      setDialogError(await blobErrorMessage(err, 'Could not download the backup'));
    } finally {
      setBusy(false);
    }
  };

  const describeTrigger = (run: BackupRun) =>
    run.trigger === 'scheduled' ? 'Scheduled' : `Manual${run.triggered_by_callsign ? ` (${run.triggered_by_callsign})` : ''}`;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          <HistoryIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Recent backups
        </Typography>

        {/* ========== BACKUP HISTORY TABLE ========== */}
        {runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No backups have been made yet.</Typography>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Started</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>How</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Size</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Off-site</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((run) => {
                  const chip = STATUS_CHIP[run.status];
                  const problem = run.error
                    || run.target_results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.message}`).join('\n');
                  return (
                    <TableRow key={run.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWhen(run.started_at)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Chip label={chip.label} color={chip.color} size="small" />
                          {/* Shows the reason when the run or an off-site copy failed */}
                          {problem && (
                            <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{problem}</span>}>
                              <ErrorOutlineIcon fontSize="small" color={run.status === 'failed' ? 'error' : 'warning'} />
                            </Tooltip>
                          )}
                          {/* Shows once someone has run Verify on this backup */}
                          {run.verified_at && (
                            <Tooltip title={`${run.verify_ok ? 'Checked' : 'Check failed'} ${formatWhen(run.verified_at)}${run.verify_ok ? '' : `: ${run.verify_detail}`}`}>
                              {run.verify_ok
                                ? <VerifiedIcon fontSize="small" color="success" />
                                : <ErrorOutlineIcon fontSize="small" color="error" />}
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{describeTrigger(run)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                        {formatBytes(run.size_bytes)}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {run.target_results.length === 0 ? '-' : run.target_results.map((r) => (
                          <Tooltip key={`${run.id}-${r.target_id}`} title={r.message}>
                            <Chip label={r.name} size="small" variant="outlined"
                              color={r.ok ? 'success' : 'error'} sx={{ mr: 0.5, mb: 0.5 }} />
                          </Tooltip>
                        ))}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {/* Only backups still on this server can be checked or downloaded */}
                        {run.file_available ? (
                          <>
                            <Tooltip title="Check this backup">
                              <IconButton onClick={() => openVerify(run)} aria-label="Check this backup">
                                <FactCheckIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Download (encrypted)">
                              <IconButton onClick={() => openDownload(run)} aria-label="Download backup">
                                <DownloadIcon />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : run.filename ? (
                          <Typography variant="caption" color="text.secondary">Removed by retention</Typography>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>

      {/* ========== VERIFY DIALOG ========== */}
      <Dialog open={!!verifyRun} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Check this backup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Decrypts the backup on the server and checks every file in it against its checksum, and the
            database for damage. Nothing is changed.
          </Typography>
          <TextField
            label="Backup passphrase"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && secret) handleVerify(); }}
            fullWidth
            autoFocus
            autoComplete="off"
          />
          {dialogError && <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-line' }}>{dialogError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={handleVerify} disabled={!secret || busy}
            startIcon={busy ? <CircularProgress size={20} /> : undefined}>
            Check
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== DOWNLOAD DIALOG ========== */}
      <Dialog open={!!downloadRun} onClose={closeDialogs} maxWidth="xs" fullWidth>
        <DialogTitle>Download backup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The file stays encrypted and opens only with the backup passphrase. Every administrator gets an
            email saying you downloaded it.
          </Typography>
          <TextField
            label="Two-factor code"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && secret) handleDownload(); }}
            fullWidth
            autoFocus
            autoComplete="one-time-code"
            inputProps={{ inputMode: 'numeric', maxLength: 8 }}
          />
          {dialogError && <Alert severity="error" sx={{ mt: 2 }}>{dialogError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialogs} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={handleDownload} disabled={!secret.trim() || busy}
            startIcon={busy ? <CircularProgress size={20} /> : <DownloadIcon />}>
            Download
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default BackupHistoryCard;
