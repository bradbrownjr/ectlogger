import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  Paper,
  Typography,
  Box,
} from '@mui/material';
import { TrafficForm } from '../../hooks/useTrafficList';
import useSortableTable from '../../hooks/useSortableTable';

// ========== TrafficTable ==========
// The Browse tab's list table. Columns: number, precedence, type, addressee,
// disposition, held-by, age. Sorting is client-side over the current page,
// matching the convention already used by AdminFieldsTab.tsx -- the backend
// list endpoint has no sort param in this phase (see
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.2).

interface TrafficTableProps {
  items: TrafficForm[];
  currentUserId?: number;
  onRowClick?: (id: number) => void;
}

type SortField = 'message_number' | 'precedence' | 'form_type' | 'addressee_display' | 'disposition' | 'filed_at';

const DISPOSITION_COLOR: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  pending: 'warning',
  relayed: 'info',
  delivered: 'success',
  cancelled: 'error',
};

const TEST_CATEGORY_LABEL: Record<string, string> = {
  drill: 'DRILL',
  demo: 'DEMO',
};

function formatAge(dateString: string): string {
  const filed = new Date(dateString).getTime();
  const diffMs = Date.now() - filed;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const TrafficTable: React.FC<TrafficTableProps> = ({ items, currentUserId, onRowClick }) => {
  const { sortField, sortDirection, handleSort } = useSortableTable<SortField>('filed_at', 'desc');

  const sorted = [...items].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    const va = (a as any)[sortField] ?? '';
    const vb = (b as any)[sortField] ?? '';
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  if (items.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">No traffic to show.</Typography>
      </Box>
    );
  }

  const columns: { field: SortField; label: string }[] = [
    { field: 'message_number', label: 'Number' },
    { field: 'precedence', label: 'Precedence' },
    { field: 'form_type', label: 'Type' },
    { field: 'addressee_display', label: 'Addressee' },
    { field: 'disposition', label: 'Disposition' },
    { field: 'filed_at', label: 'Age' },
  ];

  return (
    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell key={col.field} sx={{ whiteSpace: 'nowrap' }}>
                <TableSortLabel
                  active={sortField === col.field}
                  direction={sortField === col.field ? sortDirection : 'asc'}
                  onClick={() => handleSort(col.field)}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
            <TableCell sx={{ whiteSpace: 'nowrap' }}>Held By</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((form) => (
            <TableRow
              key={form.id}
              hover
              onClick={() => onRowClick?.(form.id)}
              sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              <TableCell>{form.message_number || '—'}</TableCell>
              <TableCell>{form.precedence || '—'}</TableCell>
              <TableCell>{form.form_type}</TableCell>
              <TableCell>{form.addressee_display || '—'}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={form.disposition}
                    size="small"
                    color={DISPOSITION_COLOR[form.disposition] ?? 'default'}
                  />
                  {form.test_category && (
                    <Chip
                      label={TEST_CATEGORY_LABEL[form.test_category]}
                      size="small"
                      variant="outlined"
                      color="secondary"
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>{formatAge(form.filed_at)}</TableCell>
              <TableCell>
                {form.held_by_user_id == null
                  ? '—'
                  : form.held_by_user_id === currentUserId
                    ? 'You'
                    : 'Another station'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TrafficTable;
