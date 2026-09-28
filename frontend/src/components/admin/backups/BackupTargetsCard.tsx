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
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DnsIcon from '@mui/icons-material/Dns';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { backupApi } from '../../../services/api';
import { getErrorMessage } from '../../../utils/apiErrors';
import { BackupTarget, BackupTargetKind, BackupTargetTestResult } from './types';

interface Props {
  targets: BackupTarget[];
  onChanged: () => void;
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

interface TargetForm {
  kind: BackupTargetKind;
  name: string;
  enabled: boolean;
  prune_enabled: boolean;
  host: string;
  port: string;
  username: string;
  path: string;
  endpoint_url: string;
  region: string;
  bucket: string;
  prefix: string;
  access_key_id: string;
  secret_access_key: string;
}

const EMPTY_FORM: TargetForm = {
  kind: 'sftp', name: '', enabled: true, prune_enabled: false,
  host: '', port: '22', username: '', path: '',
  endpoint_url: '', region: '', bucket: '', prefix: '', access_key_id: '', secret_access_key: '',
};

const formFrom = (t: BackupTarget): TargetForm => ({
  kind: t.kind, name: t.name, enabled: t.enabled, prune_enabled: t.prune_enabled,
  host: t.host ?? '', port: String(t.port ?? 22), username: t.username ?? '', path: t.path ?? '',
  endpoint_url: t.endpoint_url ?? '', region: t.region ?? '', bucket: t.bucket ?? '',
  prefix: t.prefix ?? '', access_key_id: t.access_key_id ?? '', secret_access_key: '',
});

const describeDestination = (t: BackupTarget) =>
  t.kind === 'sftp'
    ? `${t.username}@${t.host}${t.port && t.port !== 22 ? `:${t.port}` : ''}:${t.path}`
    : `${t.bucket}${t.prefix ? `/${t.prefix}` : ''}${t.endpoint_url ? ` at ${t.endpoint_url.replace(/^https?:\/\//, '')}` : ''}`;

const BackupTargetsCard: React.FC<Props> = ({ targets, onChanged, showSnackbar }) => {
  const [editing, setEditing] = useState<BackupTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TargetForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newKeyFor, setNewKeyFor] = useState<BackupTarget | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{ target: BackupTarget; result: BackupTargetTestResult } | null>(null);
  const [deleting, setDeleting] = useState<BackupTarget | null>(null);

  const set = (patch: Partial<TargetForm>) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setFormOpen(true); };
  const openEdit = (t: BackupTarget) => { setEditing(t); setForm(formFrom(t)); setFormError(null); setFormOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    const common = { name: form.name.trim(), enabled: form.enabled, prune_enabled: form.prune_enabled };
    const body = form.kind === 'sftp'
      ? { ...common, host: form.host.trim(), port: Number(form.port) || 22, username: form.username.trim(), path: form.path.trim() }
      : {
          ...common, endpoint_url: form.endpoint_url.trim() || null, region: form.region.trim() || null,
          bucket: form.bucket.trim(), prefix: form.prefix.trim(), access_key_id: form.access_key_id.trim(),
          secret_access_key: form.secret_access_key || null,
        };
    try {
      if (editing) {
        await backupApi.updateTarget(editing.id, body);
        showSnackbar('Target saved', 'success');
      } else {
        const response = await backupApi.createTarget({ kind: form.kind, ...body });
        // A new SFTP target needs its public key installed on the server first.
        if (form.kind === 'sftp') setNewKeyFor(response.data);
        else showSnackbar('Target added', 'success');
      }
      setFormOpen(false);
      onChanged();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the target'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (t: BackupTarget) => {
    setTesting(t.id);
    try {
      const response = await backupApi.testTarget(t.id);
      const result: BackupTargetTestResult = response.data;
      if (result.host_key) setHostKeyPrompt({ target: t, result });
      else showSnackbar(result.message, result.ok ? 'success' : 'error');
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not test the target'), 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleTrust = async () => {
    if (!hostKeyPrompt?.result.host_key) return;
    try {
      await backupApi.trustHostKey(hostKeyPrompt.target.id, hostKeyPrompt.result.host_key);
      const target = hostKeyPrompt.target;
      setHostKeyPrompt(null);
      onChanged();
      await handleTest(target); // now log in with the trusted key
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not trust the host key'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await backupApi.deleteTarget(deleting.id);
      showSnackbar('Target removed', 'success');
      setDeleting(null);
      onChanged();
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not remove the target'), 'error');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSnackbar('Copied', 'success');
    } catch {
      showSnackbar('Could not copy; select the text and copy it instead', 'error');
    }
  };

  const formValid = form.name.trim() && (form.kind === 'sftp'
    ? form.host.trim() && form.username.trim() && form.path.trim()
    : form.bucket.trim() && form.access_key_id.trim() && (editing || form.secret_access_key));

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="h6">
            <DnsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Off-site copies
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Add target</Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Every backup is also copied, already encrypted, to each target below.
        </Typography>

        {/* ========== TARGET LIST ========== */}
        {targets.length === 0 ? (
          <Alert severity="info">No off-site targets yet. Backups are kept on this server only.</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {targets.map((t) => (
              <Box key={t.id} sx={{
                display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
                p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1,
              }}>
                <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1">{t.name}</Typography>
                    <Chip label={t.kind === 'sftp' ? 'SFTP' : 'S3'} size="small" variant="outlined" />
                    {!t.enabled && <Chip label="Paused" size="small" />}
                    {/* Last result of this target, from the newest backup that tried it */}
                    {t.last_result && (
                      <Tooltip title={t.last_result.message}>
                        <Chip label={t.last_result.ok ? 'Last copy OK' : 'Last copy failed'} size="small"
                          color={t.last_result.ok ? 'success' : 'error'} />
                      </Tooltip>
                    )}
                    {/* SFTP target whose server has not been confirmed yet: nothing is sent to it */}
                    {t.kind === 'sftp' && !t.host_key_fingerprint && (
                      <Chip label="Host key not trusted yet" size="small" color="warning" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {describeDestination(t)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Test connection">
                    <span>
                      <IconButton onClick={() => handleTest(t)} disabled={testing === t.id} aria-label="Test connection">
                        {testing === t.id ? <CircularProgress size={20} /> : <NetworkCheckIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => openEdit(t)} aria-label="Edit target"><EditIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <IconButton onClick={() => setDeleting(t)} aria-label="Remove target" color="error"><DeleteIcon /></IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>

      {/* ========== ADD / EDIT TARGET DIALOG ========== */}
      <Dialog open={formOpen} onClose={saving ? undefined : () => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add off-site target'}</DialogTitle>
        <DialogContent>
          {!editing && (
            <FormControl fullWidth margin="normal">
              <InputLabel id="backup-target-kind">Type</InputLabel>
              <Select labelId="backup-target-kind" label="Type" value={form.kind}
                onChange={(e) => set({ kind: e.target.value as BackupTargetKind })}>
                <MenuItem value="sftp">SFTP server</MenuItem>
                <MenuItem value="s3">S3-compatible storage (Backblaze B2, Wasabi, AWS, MinIO)</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField label="Name" value={form.name} onChange={(e) => set({ name: e.target.value })}
            fullWidth margin="normal" inputProps={{ maxLength: 100 }} autoFocus />

          {/* Shows for SFTP targets */}
          {form.kind === 'sftp' ? (
            <>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Host" value={form.host} onChange={(e) => set({ host: e.target.value })}
                  fullWidth margin="normal" />
                <TextField label="Port" value={form.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, '') })}
                  margin="normal" sx={{ width: 110 }} inputProps={{ inputMode: 'numeric', maxLength: 5 }} />
              </Box>
              <TextField label="Username" value={form.username} onChange={(e) => set({ username: e.target.value })}
                fullWidth margin="normal" />
              <TextField label="Folder" value={form.path} onChange={(e) => set({ path: e.target.value })}
                fullWidth margin="normal" helperText="On the server, for example upload or /backups/ectlogger" />
              {!editing && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  A key pair is created for this target when you save. You then add its public key to the
                  SFTP user on that server.
                </Typography>
              )}
              {editing?.public_key && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom>This target's public key</Typography>
                  <PublicKeyBox value={editing.public_key} onCopy={copy} />
                </Box>
              )}
            </>
          ) : (
            /* Shows for S3-compatible targets */
            <>
              <TextField label="Endpoint URL" value={form.endpoint_url}
                onChange={(e) => set({ endpoint_url: e.target.value })} fullWidth margin="normal"
                helperText="Leave blank for AWS. Backblaze B2 example: https://s3.us-west-004.backblazeb2.com" />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Bucket" value={form.bucket} onChange={(e) => set({ bucket: e.target.value })}
                  fullWidth margin="normal" />
                <TextField label="Region" value={form.region} onChange={(e) => set({ region: e.target.value })}
                  fullWidth margin="normal" />
              </Box>
              <TextField label="Folder in the bucket" value={form.prefix} onChange={(e) => set({ prefix: e.target.value })}
                fullWidth margin="normal" helperText="Optional, for example ectlogger" />
              <TextField label="Access key ID" value={form.access_key_id}
                onChange={(e) => set({ access_key_id: e.target.value })} fullWidth margin="normal" />
              <TextField label="Secret access key" type="password" value={form.secret_access_key}
                onChange={(e) => set({ secret_access_key: e.target.value })} fullWidth margin="normal"
                autoComplete="off" helperText={editing ? 'Leave blank to keep the saved key' : ' '} />
            </>
          )}

          <FormControlLabel sx={{ mt: 1, display: 'flex' }}
            control={<Switch checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />}
            label="Copy backups here" />
          <FormControlLabel sx={{ display: 'flex' }}
            control={<Switch checked={form.prune_enabled} onChange={(e) => set({ prune_enabled: e.target.checked })} />}
            label="Delete old backups here by the same rule as this server" />
          <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 6 }}>
            Leave off when the target removes old files itself, or when it should keep everything.
          </Typography>

          {formError && <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formValid || saving}
            startIcon={saving ? <CircularProgress size={20} /> : undefined}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== NEW SFTP TARGET: INSTALL ITS PUBLIC KEY ========== */}
      <Dialog open={!!newKeyFor} onClose={() => setNewKeyFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Add this key to the SFTP server</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Add this line to the <code>authorized_keys</code> file of the user
            <strong> {newKeyFor?.username}</strong> on <strong>{newKeyFor?.host}</strong>. Then use
            Test connection on the target to confirm the server's identity.
          </Typography>
          {newKeyFor?.public_key && <PublicKeyBox value={newKeyFor.public_key} onCopy={copy} />}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setNewKeyFor(null)}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* ========== TRUST HOST KEY DIALOG ========== */}
      <Dialog open={!!hostKeyPrompt} onClose={() => setHostKeyPrompt(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{hostKeyPrompt?.result.host_key_changed ? "The server's identity changed" : "Confirm the server's identity"}</DialogTitle>
        <DialogContent>
          <Alert severity={hostKeyPrompt?.result.host_key_changed ? 'error' : 'info'} sx={{ mb: 2 }}>
            {hostKeyPrompt?.result.host_key_changed
              ? 'This server now answers with a different host key than the one you trusted. Nothing was sent. Trust the new key only if whoever runs that server confirms it changed.'
              : 'Nothing is sent to this server until you trust its host key. Compare this fingerprint with the one the server shows.'}
          </Alert>
          <Typography variant="body2" gutterBottom>Host key fingerprint</Typography>
          <Typography sx={{ fontFamily: 'monospace', wordBreak: 'break-all', p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            {hostKeyPrompt?.result.host_key_fingerprint}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            On the server: <code>ssh-keygen -lf</code> followed by the path to its host key file.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHostKeyPrompt(null)}>Cancel</Button>
          <Button variant="contained" color={hostKeyPrompt?.result.host_key_changed ? 'error' : 'primary'} onClick={handleTrust}>
            Trust this key
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== REMOVE TARGET CONFIRMATION ========== */}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove {deleting?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Backups stop being copied there. Files already on that target are left where they are.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

// ========== PUBLIC KEY (read-only, copyable) ==========
const PublicKeyBox: React.FC<{ value: string; onCopy: (text: string) => void }> = ({ value, onCopy }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
    <Typography sx={{
      flex: 1, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all',
      p: 1, bgcolor: 'action.hover', borderRadius: 1,
    }}>
      {value}
    </Typography>
    <Tooltip title="Copy">
      <IconButton onClick={() => onCopy(value)} aria-label="Copy public key"><ContentCopyIcon /></IconButton>
    </Tooltip>
  </Box>
);

export default BackupTargetsCard;
