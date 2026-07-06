import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  TextField,
  Autocomplete,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import BlockIcon from '@mui/icons-material/Block';

interface RotationMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  position: number;
  is_active: boolean;
}

interface StaffMember {
  id: number;
  user_id: number;
  user_callsign: string;
  user_name: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_co_manager: boolean;
}

interface User {
  id: number;
  callsign: string;
  name: string | null;
  email: string;
}

interface TemplateSummary {
  id: number;
  name: string;
  schedule_type?: string;
  schedule_config?: Record<string, any>;
  fifth_week_user_id: number | null;
  fifth_week_user_callsign: string | null;
  fifth_week_user_name: string | null;
}

interface NCSStaffRotationTabProps {
  hasTemplateContext: boolean;
  canEdit: boolean;
  isScheduleContext: boolean;
  isMobile: boolean;
  members: RotationMember[];
  staff: StaffMember[];
  templateSummary: TemplateSummary | null;
  availableFifthWeekUsers: User[];
  fifthWeekSaving: boolean;
  handleClearAllMembers: () => void;
  handleCreateRotationFromStaff: () => void;
  handleMoveMember: (memberId: number, direction: 'up' | 'down') => void;
  handleDragReorder: (fromIdx: number, toIdx: number) => void;
  handleToggleMemberActive: (member: RotationMember) => void;
  handleRemoveMember: (memberId: number) => void;
  handleUpdateFifthWeekUser: (selected: User | null) => void;
}

// ========== ROTATION TAB ==========
// The Rotation Order tab of NCSStaffModal: the drag-reorderable rotation
// list plus the fifth-week-operator picker. The drag-visual state
// (dragOverIdx/dragItemIdx — purely which row is currently being hovered
// during a drag) is local to this component since nothing outside it reads
// those values; the actual reorder mutation (handleDragReorder) stays a
// prop, owned by the parent, since it touches the shared `members` state
// and needs to revert via a full refetch on error.

const NCSStaffRotationTab: React.FC<NCSStaffRotationTabProps> = ({
  hasTemplateContext,
  canEdit,
  isScheduleContext,
  isMobile,
  members,
  staff,
  templateSummary,
  availableFifthWeekUsers,
  fifthWeekSaving,
  handleClearAllMembers,
  handleCreateRotationFromStaff,
  handleMoveMember,
  handleDragReorder,
  handleToggleMemberActive,
  handleRemoveMember,
  handleUpdateFifthWeekUser,
}) => {
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItemIdx = useRef<number | null>(null);

  if (!hasTemplateContext) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        This net is not linked to a schedule, so there is no rotation order.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Rotation Order</Typography>
        {canEdit && members.length > 0 && isScheduleContext && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={handleClearAllMembers}
          >
            Clear All
          </Button>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Optional: cycle NCS duty automatically across upcoming scheduled nets. If empty, nets default to the Manager.
      </Typography>

      {canEdit && isScheduleContext && staff.filter((s: StaffMember) => s.is_active && !members.some((m: RotationMember) => m.user_id === s.user_id)).length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleCreateRotationFromStaff}
            fullWidth={isMobile}
          >
            Add Staff to Rotation
          </Button>
        </Box>
      )}

      {members.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No rotation configured — nets default to the Manager.
        </Typography>
      ) : (
        <List>
          {members.map((member: RotationMember, idx: number) => (
            <ListItem
              key={member.id}
              draggable={canEdit && isScheduleContext}
              onDragStart={canEdit && isScheduleContext ? () => { dragItemIdx.current = idx; } : undefined}
              onDragOver={canEdit && isScheduleContext ? (e) => { e.preventDefault(); setDragOverIdx(idx); } : undefined}
              onDragEnd={canEdit && isScheduleContext ? () => {
                if (dragItemIdx.current !== null && dragOverIdx !== null) {
                  handleDragReorder(dragItemIdx.current, dragOverIdx);
                }
                dragItemIdx.current = null;
                setDragOverIdx(null);
              } : undefined}
              onDrop={canEdit && isScheduleContext ? (e) => e.preventDefault() : undefined}
              sx={{
                bgcolor: member.is_active ? 'background.paper' : 'action.disabledBackground',
                border: 2,
                borderColor: dragOverIdx === idx ? 'primary.main' : 'divider',
                borderRadius: 1,
                mb: 0.5,
                cursor: canEdit && isScheduleContext ? 'grab' : 'default',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                boxShadow: dragOverIdx === idx ? '0 0 0 2px rgba(25,118,210,0.25)' : 'none',
                '&:active': { cursor: canEdit && isScheduleContext ? 'grabbing' : 'default' },
              }}
            >
              <DragIndicatorIcon sx={{ mr: 1, color: canEdit && isScheduleContext ? 'action.active' : 'action.disabled', cursor: canEdit && isScheduleContext ? 'grab' : 'default' }} />
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={`#${idx + 1}`} size="small" color="primary" variant="outlined" />
                    <Typography>
                      {member.user_callsign}
                      {member.user_name && ` (${member.user_name})`}
                    </Typography>
                  </Box>
                }
              />
              {canEdit && isScheduleContext && (
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => handleMoveMember(member.id, 'up')} disabled={idx === 0}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleMoveMember(member.id, 'down')} disabled={idx === members.length - 1}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <Tooltip title={member.is_active ? 'Skip (mark inactive)' : 'Include (mark active)'}>
                    <IconButton size="small" onClick={() => handleToggleMemberActive(member)}>
                      <BlockIcon fontSize="small" color={member.is_active ? 'action' : 'error'} />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small" color="error" onClick={() => handleRemoveMember(member.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              )}
            </ListItem>
          ))}
        </List>
      )}

      {templateSummary?.schedule_type === 'weekly' && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Fifth Week Operator
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            On months with a fifth Sunday (or whichever weekday this net falls on), this operator runs the net. The main rotation pauses and resumes the following week.
          </Typography>

          {canEdit && isScheduleContext ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Autocomplete
                options={availableFifthWeekUsers}
                getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
                value={availableFifthWeekUsers.find((u: User) => u.id === templateSummary.fifth_week_user_id) || null}
                onChange={(_: any, value: User | null) => { void handleUpdateFifthWeekUser(value); }}
                renderInput={(params: any) => (
                  <TextField
                    {...params}
                    size="small"
                    label="Fifth Week Operator"
                  />
                )}
                sx={{ flex: 1 }}
                disabled={fifthWeekSaving}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={() => { void handleUpdateFifthWeekUser(null); }}
                disabled={fifthWeekSaving || !templateSummary.fifth_week_user_id}
              >
                Clear
              </Button>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {templateSummary.fifth_week_user_callsign
                ? `${templateSummary.fifth_week_user_callsign}${templateSummary.fifth_week_user_name ? ` (${templateSummary.fifth_week_user_name})` : ''}`
                : 'Not configured'}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default NCSStaffRotationTab;
