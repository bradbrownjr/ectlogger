import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import BackupIcon from '@mui/icons-material/Backup';
import KeyIcon from '@mui/icons-material/Key';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DownloadIcon from '@mui/icons-material/Download';
import { backupApi } from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import BackupKeyDialog, { BackupKeyMode } from './backups/BackupKeyDialog';
import BackupHistoryCard from './backups/BackupHistoryCard';
import BackupTargetsCard from './backups/BackupTargetsCard';
import { BackupOverview, BackupRun, BackupTarget, formatBytes, formatWhen } from './backups/types';

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const INTERVAL_CHOICES = [1, 2, 3, 4, 6, 8, 12, 24];
const POLL_MS = 3000;

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const allTimeZones = (): string[] => {
  const supported = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
  return supported?.length ? supported : [browserTimeZone(), 'UTC'];
};

interface ScheduleForm {
  enabled: boolean;
  schedule_mode: 'daily' | 'interval';
  daily_time: string;
  schedule_timezone: string;
  interval_hours: number;
  keep_daily: number;
  keep_weekly: number;
  keep_monthly: number;
  notify_on_failure: boolean;
}

const formFrom = (o: BackupOverview): ScheduleForm => ({
  enabled: o.enabled,
  schedule_mode: o.schedule_mode,
  daily_time: o.daily_time,
  // First setup: the stored default is UTC, which is rarely what an admin means by "3 AM".
  schedule_timezone: o.enabled_at || o.schedule_timezone !== 'UTC' ? o.schedule_timezone : browserTimeZone(),
  interval_hours: o.interval_hours,
  keep_daily: o.keep_daily,
  keep_weekly: o.keep_weekly,
  keep_monthly: o.keep_monthly,
  notify_on_failure: o.notify_on_failure,
});

const AdminBackupsTab: React.FC<Props> = ({ showSnackbar }) => {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [keyDialog, setKeyDialog] = useState<BackupKeyMode | null>(null);
  const pollTimer = useRef<number | null>(null);
  const timeZones = useMemo(allTimeZones, []);

  // ========== DATA LOADING ==========
  const refresh = useCallback(async (background = false) => {
    try {
      const [o, r, t] = await Promise.all([
        backupApi.overview(background), backupApi.runs(background),
        background ? Promise.resolve(null) : backupApi.targets(),
      ]);
      setOverview(o.data);
      setRuns(r.data);
      if (t) setTargets(t.data);
      setLoadError(null);
      return o.data as BackupOverview;
    } catch (err) {
      if (!background) setLoadError(getErrorMessage(err, 'Could not load backup settings'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().then((o) => { if (o) setForm(formFrom(o)); });
    return () => { if (pollTimer.current) window.clearTimeout(pollTimer.current); };
  }, [refresh]);

  // While a backup runs, refresh the status and history until it finishes.
  useEffect(() => {
    if (!overview?.running) return;
    pollTimer.current = window.setTimeout(async () => {
      const latest = await refresh(true);
      if (latest && !latest.running) {
        const t = await backupApi.targets();
        setTargets(t.data);
      }
    }, POLL_MS);
    return () => { if (pollTimer.current) window.clearTimeout(pollTimer.current); };
  }, [overview, refresh]);

  // ========== ACTIONS ==========
  const handleRunNow = async () => {
    setStarting(true);
    try {
      await backupApi.runNow();
      showSnackbar('Backup started', 'success');
      // The backup runs in its own process; give it a moment to take the lock.
      window.setTimeout(() => { refresh(true).finally(() => setStarting(false)); }, 1500);
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not start a backup'), 'error');
      setStarting(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const response = await backupApi.updateSettings(form);
      setOverview(response.data);
      setForm(formFrom(response.data));
      showSnackbar('Backup settings saved', 'success');
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not save backup settings'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleKeySaved = (o: BackupOverview) => {
    const mode = keyDialog;
    setKeyDialog(null);
    setOverview(o);
    showSnackbar(mode === 'change' ? 'Passphrase changed' : mode === 'replace' ? 'New backup key created' : 'Backup passphrase set', 'success');
  };

  const handleDownloadKey = async () => {
    try {
      const response = await backupApi.downloadKeyFile();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ectlogger-backup-key-${overview?.key_fingerprint}.age`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showSnackbar(getErrorMessage(err, 'Could not download the key file'), 'error');
    }
  };

  const set = (patch: Partial<ScheduleForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const numberField = (key: 'keep_daily' | 'keep_weekly' | 'keep_monthly', label: string, max: number) => (
    <TextField
      label={label}
      type="number"
      value={form?.[key] ?? 0}
      onChange={(e) => set({ [key]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) } as Partial<ScheduleForm>)}
      inputProps={{ min: 0, max }}
      sx={{ flex: '1 1 120px' }}
    />
  );

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (loadError || !overview || !form) {
    return <Alert severity="error">{loadError || 'Could not load backup settings'}</Alert>;
  }

  const hasKey = !!overview.key_fingerprint;
  const running = overview.running || starting;

  // ========== STATUS LINE ==========
  // One message, most urgent first.
  let status: { severity: 'success' | 'info' | 'warning' | 'error'; text: string };
  if (!hasKey) {
    status = { severity: 'info', text: 'Set a backup passphrase to start making backups.' };
  } else if (overview.enabled && overview.overdue) {
    status = {
      severity: 'error',
      text: overview.last_success_at
        ? `No successful backup since ${formatWhen(overview.last_success_at)}.`
        : 'No backup has succeeded since backups were turned on.',
    };
  } else if (overview.scheduler_note) {
    status = { severity: 'warning', text: overview.scheduler_note };
  } else if (!overview.enabled) {
    status = { severity: 'info', text: 'Scheduled backups are off. Back up now still works.' };
  } else {
    status = {
      severity: 'success',
      text: overview.last_success_at
        ? `Last successful backup: ${formatWhen(overview.last_success_at)}.`
        : 'Backups are on. The first one runs at the next scheduler check, within about 15 minutes.',
    };
  }

  return (
    <>
      {/* ========== TAB: BACKUPS ========== */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Typography variant="h6">
          <BackupIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
          Backups
        </Typography>
        <Button
          variant="contained"
          onClick={handleRunNow}
          disabled={!hasKey || running}
          startIcon={running ? <CircularProgress size={20} color="inherit" /> : <BackupIcon />}
        >
          {running ? 'Backing up...' : 'Back up now'}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* ========== STATUS CARD ========== */}
        <Card variant="outlined">
          <CardContent>
            <Alert severity={status.severity} sx={{ mb: 2 }}>{status.text}</Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Kept on this server</Typography>
                <Typography variant="body1">
                  {overview.local_count} backup{overview.local_count === 1 ? '' : 's'}, {formatBytes(overview.local_bytes) || '0 B'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Scheduler last checked in</Typography>
                <Typography variant="body1">
                  {overview.scheduler_mode === 'off' ? 'Turned off on this server' : formatWhen(overview.last_scheduler_check_at)}
                </Typography>
              </Box>
              <Box sx={{ gridColumn: { sm: '1 / -1' }, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">Folder</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {overview.backup_dir}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* ========== ENCRYPTION CARD ========== */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <KeyIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Encryption
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Every backup is encrypted. Restoring one takes the backup passphrase, which this server does not
              keep. Keep it, and a copy of the key file, somewhere other than this server.
            </Typography>
            {/* Shows once a passphrase has been set */}
            {hasKey ? (
              <>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Key <Box component="span" sx={{ fontFamily: 'monospace' }}>{overview.key_fingerprint}</Box>, created {formatWhen(overview.key_created_at)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="outlined" onClick={() => setKeyDialog('change')}>Change passphrase</Button>
                  <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadKey}>Key file</Button>
                  <Button variant="outlined" color="warning" onClick={() => setKeyDialog('replace')}>Replace key</Button>
                </Box>
              </>
            ) : (
              <Button variant="contained" onClick={() => setKeyDialog('create')}>Set passphrase</Button>
            )}
          </CardContent>
        </Card>

        {/* ========== SCHEDULE AND RETENTION CARD ========== */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <ScheduleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Schedule
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography variant="body1">Scheduled backups</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {hasKey ? 'Makes a backup automatically on the schedule below.' : 'Set a passphrase first.'}
                  </Typography>
                </Box>
                <Switch checked={form.enabled} disabled={!hasKey} onChange={(e) => set({ enabled: e.target.checked })} />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControl sx={{ flex: '1 1 180px' }}>
                  <InputLabel id="backup-frequency">How often</InputLabel>
                  <Select labelId="backup-frequency" label="How often" value={form.schedule_mode}
                    onChange={(e) => set({ schedule_mode: e.target.value as ScheduleForm['schedule_mode'] })}>
                    <MenuItem value="daily">Once a day</MenuItem>
                    <MenuItem value="interval">Every few hours</MenuItem>
                  </Select>
                </FormControl>
                {/* Daily: a time of day in a chosen time zone */}
                {form.schedule_mode === 'daily' ? (
                  <>
                    <TextField label="At" type="time" value={form.daily_time}
                      onChange={(e) => set({ daily_time: e.target.value })}
                      InputLabelProps={{ shrink: true }} sx={{ flex: '0 1 140px' }} />
                    <Autocomplete
                      options={timeZones}
                      value={form.schedule_timezone}
                      onChange={(_, value) => value && set({ schedule_timezone: value })}
                      disableClearable
                      sx={{ flex: '1 1 240px' }}
                      renderInput={(params) => <TextField {...params} label="Time zone" />}
                    />
                  </>
                ) : (
                  /* Interval: every N hours after the last backup */
                  <FormControl sx={{ flex: '1 1 160px' }}>
                    <InputLabel id="backup-interval">Every</InputLabel>
                    <Select labelId="backup-interval" label="Every" value={form.interval_hours}
                      onChange={(e) => set({ interval_hours: Number(e.target.value) })}>
                      {INTERVAL_CHOICES.map((h) => (
                        <MenuItem key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>

              <Box>
                <Typography variant="body1" gutterBottom>Keep on this server</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
                  The newest backup of each day, week and month, up to these counts. Older ones are deleted
                  after each backup. The newest backup is always kept.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {numberField('keep_daily', 'Daily', 365)}
                  {numberField('keep_weekly', 'Weekly', 260)}
                  {numberField('keep_monthly', 'Monthly', 120)}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography variant="body1">Email administrators when a backup fails</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Also sent once if no backup has succeeded for a day and a half (or one and a half of your intervals).
                  </Typography>
                </Box>
                <Switch checked={form.notify_on_failure} onChange={(e) => set({ notify_on_failure: e.target.checked })} />
              </Box>

              <Box>
                <Button variant="contained" onClick={handleSave} disabled={saving}
                  startIcon={saving ? <CircularProgress size={20} color="inherit" /> : undefined}>
                  Save schedule
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <BackupTargetsCard targets={targets} onChanged={() => refresh()} showSnackbar={showSnackbar} />
        <BackupHistoryCard runs={runs} onChanged={() => refresh()} showSnackbar={showSnackbar} />
      </Box>

      <BackupKeyDialog
        open={keyDialog !== null}
        mode={keyDialog ?? 'create'}
        onClose={() => setKeyDialog(null)}
        onSaved={handleKeySaved}
      />
    </>
  );
};

export default AdminBackupsTab;
