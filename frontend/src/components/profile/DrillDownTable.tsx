import React from 'react';
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

// ========== DRILL-DOWN TABLE ==========
// Shared paginated table used by both Activity-tab drill-downs (the stat-card
// drill-down and the favorite-net session drill-down). Both were near-
// identical: Date + optional Check-ins + View-icon columns, the same
// DRILL_PAGE_SIZE-based Prev/Next pagination. The caller normalizes its raw
// stat rows into DrillDownRow before passing them in; this component owns
// only the table/pagination JSX.

export interface DrillDownRow {
  net_id: number;
  net_name?: string;
  date: string | null | undefined;
  check_in_count?: number;
}

interface DrillDownTableProps {
  rows: DrillDownRow[];
  showNetName: boolean;
  showCheckIns: boolean;
  page: number;
  onPageChange: (updater: (p: number) => number) => void;
  pageSize: number;
  emptyMessage: string;
  onView: (netId: number, event: React.MouseEvent) => void;
  /** Tooltip/label for the row action button. Defaults to "View net" for the
   * original net-drill-down callers; a caller repurposing net_id as some
   * other row identifier (e.g. the traffic drill-down using it as form_id)
   * should override this so the tooltip doesn't say "net". */
  viewLabel?: string;
}

const DrillDownTable: React.FC<DrillDownTableProps> = ({
  rows,
  showNetName,
  showCheckIns,
  page,
  onPageChange,
  pageSize,
  emptyMessage,
  onView,
  viewLabel = 'View net',
}) => {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {showNetName && <TableCell>Net Name</TableCell>}
              <TableCell>Date</TableCell>
              {showCheckIns && <TableCell align="right">Check-ins</TableCell>}
              <TableCell align="right">View</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => (
              <TableRow key={row.net_id} hover>
                {showNetName && <TableCell>{row.net_name}</TableCell>}
                <TableCell>
                  {row.date
                    ? new Date(row.date).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })
                    : '—'}
                </TableCell>
                {showCheckIns && <TableCell align="right">{row.check_in_count}</TableCell>}
                <TableCell align="right">
                  <Tooltip title={viewLabel}>
                    <IconButton
                      size="small"
                      onClick={(e) => onView(row.net_id, e)}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {rows.length > pageSize && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1, px: 0.5 }}>
          <Button size="small" disabled={page === 0} onClick={() => onPageChange(p => p - 1)}>Previous</Button>
          <Typography variant="caption" color="text.secondary">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}
          </Typography>
          <Button size="small" disabled={(page + 1) * pageSize >= rows.length} onClick={() => onPageChange(p => p + 1)}>Next</Button>
        </Box>
      )}
    </>
  );
};

export default DrillDownTable;
