import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AdminFilterBar from './AdminFilterBar';
import api from '../../services/api';
import { getErrorMessage } from '../../utils/apiErrors';
import { formatDateTime } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import {
  ACTION_GROUPS,
  ActivityEvent,
  actionLabel,
  describeChanges,
  describeDetails,
} from '../../utils/activityLog';

// ========== ADMIN ACTIVITY TAB ==========
// The activity log: who deleted, cancelled or changed a net, schedule or
// account, every sign-in and failed attempt, and from what address. Admins
// only (backend routers/audit.py). Clicking a person, a net, a schedule or
// an address narrows the list to it; an address also lists every account
// seen using it, which is how one person behind several accounts shows up.

export interface ActivityPerson {
  id: number;
  label: string;
}

interface Props {
  showSnackbar: (message: string, severity: 'success' | 'error') => void;
  /** Set by "Show activity" on the Users tab. */
  person: ActivityPerson | null;
  onPersonChange: (person: ActivityPerson | null) => void;
}

interface Scoped {
  id: number;
  label: string;
}

interface IpAccount {
  user_id: number | null;
  label: string | null;
  events: number;
  first_seen: string;
  last_seen: string;
}

const PAGE_SIZES = [25, 50, 100];

const AdminActivityTab: React.FC<Props> = ({ showSnackbar, person, onPersonChange }) => {
  const { user: currentUser } = useAuth();
  const preferUtc = currentUser?.prefer_utc || false;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [group, setGroup] = useState('');
  const [ip, setIp] = useState<string | null>(null);
  const [net, setNet] = useState<Scoped | null>(null);
  const [schedule, setSchedule] = useState<Scoped | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ipAccounts, setIpAccounts] = useState<IpAccount[]>([]);

  // Typing in the search box waits for a pause before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, group, ip, net, schedule, person, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/audit', {
        params: {
          search: debouncedSearch || undefined,
          action: group || undefined,
          ip: ip || undefined,
          net_id: net?.id,
          template_id: schedule?.id,
          user_id: person?.id,
          limit: pageSize,
          offset: page * pageSize,
        },
      })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data.items);
        setTotal(res.data.total);
      })
      .catch((err) => !cancelled && showSnackbar(getErrorMessage(err, 'Could not load the activity log'), 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // showSnackbar is recreated on every Admin render; it never changes what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, group, ip, net, schedule, person, page, pageSize]);

  // ========== ACCOUNTS SEEN FROM ONE ADDRESS ==========
  useEffect(() => {
    if (!ip) {
      setIpAccounts([]);
      return;
    }
    api
      .get('/audit/ip-accounts', { params: { ip } })
      .then((res) => setIpAccounts(res.data))
      .catch((err) => showSnackbar(getErrorMessage(err, 'Could not load accounts for that address'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip]);

  const filterChips = [
    person && { key: 'person', label: `Person: ${person.label}`, clear: () => onPersonChange(null) },
    ip && { key: 'ip', label: `Address: ${ip}`, clear: () => setIp(null) },
    net && { key: 'net', label: `Net: ${net.label}`, clear: () => setNet(null) },
    schedule && { key: 'schedule', label: `Schedule: ${schedule.label}`, clear: () => setSchedule(null) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Who did what, and from where. Addresses and browsers are cleared after a year, and entries are
        removed after three.
      </Typography>

      {/* ========== FILTERS ========== */}
      <AdminFilterBar value={search} onChange={setSearch} placeholder="Search callsigns, names, nets and details">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="activity-group-label">Show</InputLabel>
          <Select
            labelId="activity-group-label"
            label="Show"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <MenuItem value="">All activity</MenuItem>
            {ACTION_GROUPS.map((g) => (
              <MenuItem key={g.prefix} value={g.prefix}>
                {g.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">
          {loading ? 'Loading…' : `${total} ${total === 1 ? 'entry' : 'entries'}`}
        </Typography>
      </AdminFilterBar>

      {filterChips.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {filterChips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onDelete={chip.clear} />
          ))}
        </Box>
      )}

      {/* Shows when filtering by address: every account seen using it */}
      {ip && ipAccounts.length > 0 && (
        <Alert severity={ipAccounts.length > 1 ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {ipAccounts.length === 1 ? 'One account has used this address: ' : `${ipAccounts.length} accounts have used this address: `}
          {ipAccounts.map((account, i) => (
            <React.Fragment key={`${account.user_id}-${account.label}`}>
              {i > 0 && ', '}
              {account.user_id != null ? (
                <Link
                  component="button"
                  onClick={() => onPersonChange({ id: account.user_id as number, label: account.label || '' })}
                >
                  {account.label}
                </Link>
              ) : (
                account.label
              )}
              {` (${account.events})`}
            </React.Fragment>
          ))}
        </Alert>
      )}

      {/* ========== ACTIVITY TABLE ========== */}
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell>What</TableCell>
              <TableCell>Details</TableCell>
              <TableCell>From</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loading && events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">
                    Nothing matches.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {events.map((event) => {
              const lines = [...describeChanges(event.details), ...describeDetails(event.details)];
              return (
                <TableRow key={event.id} hover sx={{ verticalAlign: 'top' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(event.created_at, preferUtc)}</TableCell>

                  {/* Who: a link narrows to that account; a deleted account keeps only its name */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {event.actor_user_id != null ? (
                      <Link
                        component="button"
                        onClick={() => onPersonChange({ id: event.actor_user_id as number, label: event.actor_label || '' })}
                      >
                        {event.actor_label}
                      </Link>
                    ) : (
                      <Typography variant="body2" color="text.secondary" component="span">
                        {event.actor_label || 'Automatic'}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{actionLabel(event.action)}</Typography>
                    {event.target_label && (
                      <Typography variant="body2" color="text.secondary">
                        {event.target_type === 'net' && event.net_id != null ? (
                          <Link component="button" onClick={() => setNet({ id: event.net_id as number, label: event.target_label || '' })}>
                            {event.target_label}
                          </Link>
                        ) : event.target_type === 'schedule' && event.template_id != null ? (
                          <Link
                            component="button"
                            onClick={() => setSchedule({ id: event.template_id as number, label: event.target_label || '' })}
                          >
                            {event.target_label}
                          </Link>
                        ) : event.target_type === 'user' && event.subject_user_id != null && event.subject_user_id !== event.actor_user_id ? (
                          <Link
                            component="button"
                            onClick={() => onPersonChange({ id: event.subject_user_id as number, label: event.target_label || '' })}
                          >
                            {event.target_label}
                          </Link>
                        ) : (
                          event.target_label
                        )}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell sx={{ maxWidth: 360 }}>
                    {lines.map((line) => (
                      <Typography key={line} variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                        {line}
                      </Typography>
                    ))}
                  </TableCell>

                  {/* From: the browser shows on hover; clicking the address narrows to it */}
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {event.ip ? (
                      <Tooltip title={event.user_agent || ''}>
                        <Link component="button" onClick={() => setIp(event.ip)}>
                          {event.ip}
                        </Link>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary" component="span">
                        Not recorded
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => setPageSize(parseInt(e.target.value, 10))}
        rowsPerPageOptions={PAGE_SIZES}
      />
    </Box>
  );
};

export default AdminActivityTab;
