import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RadioIcon from '@mui/icons-material/Radio';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArchiveIcon from '@mui/icons-material/Archive';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import LanguageIcon from '@mui/icons-material/Language';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EmailIcon from '@mui/icons-material/Email';
import Avatar from '@mui/material/Avatar';
import ExpandableDescription from '../ExpandableDescription';
import CardActionButton from '../CardActionButton';
import { formatDateTime } from '../../utils/dateUtils';

// ---- Types ----

export interface Net {
  id: number;
  name: string;
  description: string;
  info_url?: string;
  status: string;
  owner_id: number;
  owner_callsign?: string | null;
  owner_name?: string | null;
  // Assigned NCS for this net (most recent NetRole with role='NCS')
  ncs_callsign?: string | null;
  ncs_name?: string | null;
  logo_url?: string | null;
  template_id?: number | null;
  started_at?: string;
  closed_at?: string;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  scheduled_start_time?: string;
  topic_of_week_enabled?: boolean;
  topic_of_week_prompt?: string | null;
  poll_enabled?: boolean;
  poll_question?: string | null;
  frequencies: any[];
  check_in_count?: number;
  can_manage?: boolean;
  is_owner_or_ncs?: boolean;
  user_attended?: boolean | null;
  user_ran?: boolean | null;
}

// ---- Utility ----

export function getStatusColor(status: string): 'success' | 'warning' | 'default' | 'info' {
  switch (status) {
    case 'active': return 'success';
    case 'lobby': return 'warning';
    case 'closed': return 'default';
    case 'scheduled': return 'info';
    case 'cancelled': return 'default';
    default: return 'default';
  }
}

// ---- Props ----

interface NetCardProps {
  net: Net;
  favorites: Set<number>;
  onToggleFavorite: (templateId: number) => void;
  /** Whether the current user can manage this specific net (pre-computed by parent). */
  canManage: boolean;
  preferUtc: boolean;
  onStaffClick: () => void;
  onDeleteClick: () => void;
  onStartNet: () => void;
  onEmailClick: () => void;
  onExportCSV: () => void;
  onArchiveNet: () => void;
}

// ========== NET CARD COMPONENT ==========
// Card tile for a single net, used in the Dashboard card view.

const NetCard: React.FC<NetCardProps> = ({
  net,
  favorites,
  onToggleFavorite,
  canManage,
  preferUtc,
  onStaffClick,
  onDeleteClick,
  onStartNet,
  onEmailClick,
  onExportCSV,
  onArchiveNet,
}) => {
  const navigate = useNavigate();
  const isFavorite = net.template_id != null && favorites.has(net.template_id);

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <CardContent sx={{ flex: 1 }}>
        {/* ---- Title with status chip and favorite toggle ---- */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography
            variant="h6"
            component="h2"
            onClick={() => navigate(`/nets/${net.id}`)}
            sx={{
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flex: 1,
              mr: 0.5,
            }}
          >
            {net.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {net.logo_url && (
              <Avatar variant="rounded" src={net.logo_url} sx={{ width: 28, height: 28 }} />
            )}
            <Chip label={net.status} color={getStatusColor(net.status)} size="small" />
            {net.template_id != null && (
              <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                <IconButton
                  size="small"
                  onClick={() => onToggleFavorite(net.template_id!)}
                  sx={{ color: isFavorite ? 'warning.main' : 'action.disabled', p: 0.25 }}
                >
                  {isFavorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* ---- Description ---- */}
        <ExpandableDescription text={net.description} />

        {/* ---- Info list ---- */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {/* Time based on status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {net.status === 'closed' && net.closed_at && (
                <>Closed: {formatDateTime(net.closed_at, preferUtc)}</>
              )}
              {net.status === 'active' && net.started_at && (
                <>Started: {formatDateTime(net.started_at, preferUtc)}</>
              )}
              {net.status === 'lobby' && net.scheduled_start_time && (
                <>Starts at: {formatDateTime(net.scheduled_start_time, preferUtc)}</>
              )}
              {(net.status === 'draft' || net.status === 'scheduled') && net.scheduled_start_time && (
                <>Scheduled: {formatDateTime(net.scheduled_start_time, preferUtc)}</>
              )}
              {(net.status === 'draft' || net.status === 'scheduled') && !net.scheduled_start_time && (
                <>Created: {formatDateTime(net.created_at, preferUtc)}</>
              )}
            </Typography>
          </Box>

          {/* Frequencies */}
          {net.frequencies.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RadioIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary">
                {net.frequencies.map((f: any) => {
                  if (f.frequency) return f.frequency;
                  if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
                  if (f.network) return f.network;
                  return '';
                }).filter((s: string) => s).join(', ')}
              </Typography>
            </Box>
          )}

          {/* ---- Net Manager (owner) ----
              The owner created/scheduled the net. Shown when set. */}
          {net.owner_callsign && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>Net Manager:</strong> {net.owner_callsign}
                {net.owner_name && ` (${net.owner_name})`}
              </Typography>
            </Box>
          )}

          {/* ---- Current / Next NCS ----
              For draft/scheduled: always show (duty operator is upcoming).
              For active/closed: suppress when NCS == manager to avoid redundancy. */}
          {net.ncs_callsign && (
            (net.status === 'draft' || net.status === 'scheduled')
              ? true
              : net.ncs_callsign !== net.owner_callsign
          ) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                <strong>{net.status === 'draft' || net.status === 'scheduled' ? 'Next NCS' : 'NCS'}:</strong> {net.ncs_callsign}
                {net.ncs_name && ` (${net.ncs_name})`}
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>

      {/* Action groups. flexWrap + space-between gives a width-responsive layout
          with no breakpoint: when both groups fit on one line (wide cards) they
          are pushed to opposite edges — management left, standard right. When
          they no longer fit side by side, each group wraps onto its own line,
          and space-between places a lone item on a line at its start, so the
          stacked groups stay left-aligned. Non-staff render only the standard
          group, which then sits alone at the left.
          disableSpacing: MUI's default CardActions applies margin-left to
          sibling children, which would offset the second group. */}
      <CardActions
        disableSpacing
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* ---- Management group (staff/admin only) ----
            First in DOM order so it takes the left/top position, letting
            managers reach these without hunting past the view-only controls
            everyone else sees. Mirrors the Schedule card's group split. */}
        {canManage && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 0.5 }}>
            {/* Draft/Scheduled: email, edit, cancel, start — ordered by
                severity (neutral, then destructive, then the primary action
                last) so Start sits away from Cancel and is easy to hit
                without risking an accidental cancel. */}
            {(net.status === 'draft' || net.status === 'scheduled') && (
              <>
                {net.template_id && (
                  <CardActionButton
                    icon={<EmailIcon />}
                    label="Email"
                    tooltip="Email subscribers"
                    onClick={onEmailClick}
                  />
                )}
                <CardActionButton
                  icon={<EditIcon />}
                  label="Edit"
                  tooltip="Edit net"
                  onClick={() => navigate(`/nets/${net.id}/edit`)}
                />
                <CardActionButton
                  icon={<DeleteIcon />}
                  label="Cancel"
                  color="error"
                  tooltip="Cancel this net"
                  onClick={onDeleteClick}
                />
                <CardActionButton
                  icon={<PlayArrowIcon />}
                  label="Start"
                  color="success"
                  tooltip="Start net"
                  onClick={onStartNet}
                />
              </>
            )}

            {/* Active/Lobby: delete */}
            {(net.status === 'active' || net.status === 'lobby') && (
              <CardActionButton
                icon={<DeleteIcon />}
                label="Delete"
                color="error"
                tooltip="Delete net"
                onClick={onDeleteClick}
              />
            )}

            {/* Closed: stats, export, PDF, archive, delete */}
            {net.status === 'closed' && (
              <>
                <CardActionButton
                  icon={<BarChartIcon sx={{ color: '#ff9800' }} />}
                  label="Stats"
                  tooltip="Net statistics"
                  onClick={() => navigate(`/statistics/nets/${net.id}`)}
                />
                <CardActionButton
                  icon={<DownloadIcon sx={{ color: '#4caf50' }} />}
                  label="Export"
                  tooltip="Export log"
                  onClick={onExportCSV}
                />
                <CardActionButton
                  icon={<PictureAsPdfIcon sx={{ color: '#4caf50' }} />}
                  label="Report"
                  tooltip="Net report (PDF)"
                  onClick={() => navigate(`/nets/${net.id}/report`)}
                />
                <CardActionButton
                  icon={<ArchiveIcon />}
                  label="Archive"
                  tooltip="Archive net"
                  onClick={onArchiveNet}
                />
                <CardActionButton
                  icon={<DeleteIcon />}
                  label="Delete"
                  color="error"
                  tooltip="Delete net"
                  onClick={onDeleteClick}
                />
              </>
            )}
          </Box>
        )}

        {/* ---- Standard row (everyone) ---- */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 0.5 }}>
          <CardActionButton
            icon={<SearchIcon />}
            label="View"
            color="primary"
            tooltip="View net"
            onClick={() => navigate(`/nets/${net.id}`)}
          />
          <CardActionButton
            icon={<GroupsIcon sx={{ color: '#9c27b0' }} />}
            label="Staff"
            tooltip="View net staff"
            onClick={onStaffClick}
          />
          {(net.status === 'active' || net.status === 'lobby') && (
            <CardActionButton
              icon={<BarChartIcon sx={{ color: '#ff9800' }} />}
              label="Stats"
              tooltip="Net statistics"
              onClick={() => navigate(`/statistics/nets/${net.id}`)}
            />
          )}
          {net.info_url && (
            <CardActionButton
              icon={<LanguageIcon />}
              label="Info"
              tooltip="Net/Club info"
              onClick={() => window.open(net.info_url, '_blank')}
            />
          )}
        </Box>
      </CardActions>
    </Card>
  );
};

export default NetCard;
