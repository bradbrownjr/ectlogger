// Shapes returned by /api/backups (backend/app/schemas.py "BACKUPS").

export interface BackupOverview {
  enabled: boolean;
  enabled_at: string | null;
  schedule_mode: 'daily' | 'interval';
  daily_time: string;
  schedule_timezone: string;
  interval_hours: number;
  keep_daily: number;
  keep_weekly: number;
  keep_monthly: number;
  notify_on_failure: boolean;
  key_fingerprint: string | null;
  key_created_at: string | null;
  scheduler_mode: 'cron' | 'internal' | 'off';
  last_scheduler_check_at: string | null;
  scheduler_note: string | null;
  backup_dir: string;
  local_count: number;
  local_bytes: number;
  last_success_at: string | null;
  overdue: boolean;
  running: boolean;
}

export interface BackupTargetResult {
  target_id: number | null;
  name: string;
  ok: boolean;
  message: string;
}

export interface BackupRun {
  id: number;
  trigger: 'scheduled' | 'manual';
  triggered_by_callsign: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  started_at: string;
  finished_at: string | null;
  filename: string | null;
  size_bytes: number | null;
  key_fingerprint: string | null;
  target_results: BackupTargetResult[];
  error: string | null;
  verified_at: string | null;
  verify_ok: boolean | null;
  verify_detail: string | null;
  file_available: boolean;
}

export type BackupTargetKind = 'sftp' | 's3';

export interface BackupTarget {
  id: number;
  name: string;
  kind: BackupTargetKind;
  enabled: boolean;
  prune_enabled: boolean;
  host: string | null;
  port: number | null;
  username: string | null;
  path: string | null;
  endpoint_url: string | null;
  region: string | null;
  bucket: string | null;
  prefix: string | null;
  access_key_id: string | null;
  has_secret: boolean;
  public_key: string | null;
  host_key_fingerprint: string | null;
  last_result: BackupTargetResult | null;
}

export interface BackupTargetTestResult {
  ok: boolean;
  message: string;
  host_key: string | null;
  host_key_fingerprint: string | null;
  host_key_changed: boolean;
}

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export const formatWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
