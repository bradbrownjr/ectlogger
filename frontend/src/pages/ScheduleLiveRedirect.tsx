import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { netApi } from '../services/api';
import { scheduleHomePath } from '../utils/scheduleLinks';
import { ON_AIR_STATUSES } from './ScheduleHome';

/**
 * /scheduler/:scheduleId/live: the link a club puts on its own website.
 *
 * Opens the schedule's net when exactly one is on the air (lobby or active).
 * With none, or several at once (two activations), it opens the schedule's
 * home page, where they are listed and staff can create one.
 */
const ScheduleLiveRedirect: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const id = Number(scheduleId);
    const home = scheduleHomePath(scheduleId || '');
    if (!Number.isInteger(id) || id <= 0) {
      navigate(home, { replace: true });
      return;
    }
    netApi.listForSchedule(id, ON_AIR_STATUSES)
      .then((response) => {
        const nets: { id: number }[] = response.data;
        navigate(nets.length === 1 ? `/nets/${nets[0].id}` : home, { replace: true });
      })
      .catch(() => navigate(home, { replace: true }));
  }, [scheduleId, navigate]);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <CircularProgress size={48} />
    </Box>
  );
};

export default ScheduleLiveRedirect;
