import React from 'react';
import {
  TextField,
  Typography,
  Box,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  InputLabel,
  Autocomplete,
} from '@mui/material';
import { useCreateScheduleContext, User } from '../../contexts/CreateScheduleContext';

// ========== TAB 1: SCHEDULE CONFIGURATION ==========
// Schedule type (one-time, ad-hoc, daily, weekly, monthly), recurrence time/day,
// and optional fifth-week operator (weekly schedules only)

const ScheduleTab: React.FC = () => {
  const {
    scheduleType, setScheduleType,
    scheduleConfig, setScheduleConfig,
    fifthWeekUserId, setFifthWeekUserId,
    timezoneAbbr,
    currentUser,
    ownerId,
    users,
    staff,
  } = useCreateScheduleContext();

  // Whether the current user can configure the fifth-week operator:
  // admins, the schedule manager, and active co-managers.
  const canConfigureFifthWeekOperator = !!currentUser && (
    currentUser.role === 'admin' ||
    currentUser.id === ownerId ||
    staff.some(s => s.user_id === currentUser.id && s.is_active && s.is_co_manager)
  );

  const eligibleForRotationIds = new Set<number>([
    ...(ownerId ? [ownerId] : []),
    ...staff.filter(s => s.is_active).map(s => s.user_id),
  ]);
  const eligibleForFifthWeekIds = new Set<number>([
    ...eligibleForRotationIds,
    ...(fifthWeekUserId ? [fifthWeekUserId] : []),
  ]);
  const availableUsersForFifthWeek = users.filter(
    (u: User) => eligibleForFifthWeekIds.has(u.id)
  );

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose how often this net runs:
      </Typography>
      <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
        <li><strong>One-Time</strong> — Create a single net right now (for special events or testing)</li>
        <li><strong>Ad-Hoc</strong> — Save as a template to start nets manually whenever needed</li>
        <li><strong>Daily/Weekly/Monthly</strong> — Set up a recurring schedule</li>
      </Box>

      <FormControl fullWidth margin="normal">
        <InputLabel>Schedule Type</InputLabel>
        <Select
          value={scheduleType}
          label="Schedule Type"
          onChange={(e) => {
            setScheduleType(e.target.value);
            if (e.target.value === 'ad_hoc' || e.target.value === 'one_time') {
              setScheduleConfig({ day_of_week: 1, week_of_month: [], time: '18:00' });
            }
          }}
        >
          <MenuItem value="one_time">One-Time Net</MenuItem>
          <MenuItem value="ad_hoc">Ad-Hoc (Start Manually)</MenuItem>
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
        </Select>
      </FormControl>

      {/* ========== Daily config ========== */}
      {scheduleType === 'daily' && (
        <TextField
          fullWidth
          type="time"
          label={`Time (${timezoneAbbr})`}
          value={scheduleConfig.time}
          onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
          margin="normal"
          InputLabelProps={{ shrink: true }}
        />
      )}

      {/* ========== Weekly config ========== */}
      {scheduleType === 'weekly' && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Day of Week</InputLabel>
              <Select
                value={scheduleConfig.day_of_week}
                label="Day of Week"
                onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
              >
                <MenuItem value={0}>Sunday</MenuItem>
                <MenuItem value={1}>Monday</MenuItem>
                <MenuItem value={2}>Tuesday</MenuItem>
                <MenuItem value={3}>Wednesday</MenuItem>
                <MenuItem value={4}>Thursday</MenuItem>
                <MenuItem value={5}>Friday</MenuItem>
                <MenuItem value={6}>Saturday</MenuItem>
              </Select>
            </FormControl>
            <TextField
              type="time"
              label={`Time (${timezoneAbbr})`}
              value={scheduleConfig.time}
              onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
          </Box>
          {canConfigureFifthWeekOperator && (
            <Autocomplete
              options={availableUsersForFifthWeek}
              getOptionLabel={(option: User) => `${option.callsign}${option.name ? ` (${option.name})` : ''}`}
              value={availableUsersForFifthWeek.find((u: User) => u.id === fifthWeekUserId) || null}
              onChange={(_: any, value: User | null) => setFifthWeekUserId(value?.id ?? null)}
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  margin="normal"
                  label="Optional Fifth Week Operator"
                  helperText="Optional. Runs the net on months with a fifth week. The main rotation pauses and resumes the following week."
                />
              )}
            />
          )}
        </Box>
      )}

      {/* ========== Monthly config ========== */}
      {scheduleType === 'monthly' && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>Which weeks of the month?</Typography>
          <FormGroup sx={{ flexDirection: 'row', gap: 2, mb: 2 }}>
            {[1, 2, 3, 4, 5].map((week) => (
              <FormControlLabel
                key={week}
                control={
                  <Checkbox
                    checked={scheduleConfig.week_of_month?.includes(week) || false}
                    onChange={(e) => {
                      const weeks = scheduleConfig.week_of_month || [];
                      if (e.target.checked) {
                        setScheduleConfig({ ...scheduleConfig, week_of_month: [...weeks, week] });
                      } else {
                        setScheduleConfig({ ...scheduleConfig, week_of_month: weeks.filter(w => w !== week) });
                      }
                    }}
                  />
                }
                label={week === 5 ? 'Last' : `${week}${week === 1 ? 'st' : week === 2 ? 'nd' : week === 3 ? 'rd' : 'th'}`}
              />
            ))}
          </FormGroup>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Day of Week</InputLabel>
              <Select
                value={scheduleConfig.day_of_week}
                label="Day of Week"
                onChange={(e) => setScheduleConfig({ ...scheduleConfig, day_of_week: Number(e.target.value) })}
              >
                <MenuItem value={0}>Sunday</MenuItem>
                <MenuItem value={1}>Monday</MenuItem>
                <MenuItem value={2}>Tuesday</MenuItem>
                <MenuItem value={3}>Wednesday</MenuItem>
                <MenuItem value={4}>Thursday</MenuItem>
                <MenuItem value={5}>Friday</MenuItem>
                <MenuItem value={6}>Saturday</MenuItem>
              </Select>
            </FormControl>
            <TextField
              type="time"
              label={`Time (${timezoneAbbr})`}
              value={scheduleConfig.time}
              onChange={(e) => setScheduleConfig({ ...scheduleConfig, time: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
          </Box>
        </Box>
      )}
    </>
  );
};

export default ScheduleTab;
