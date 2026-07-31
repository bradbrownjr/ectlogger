import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Snackbar } from '@mui/material';
import { netApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNetWebSocket } from '../hooks/useNetWebSocket';
import Chat from '../components/Chat';
import ActivityLog from '../components/ActivityLog';

// Bare-bones page rendered inside a real popped-out browser window (see
// usePoppedOutWindow / the "Open in new window" buttons in Chat and
// ActivityLog). No Navbar/chrome — App.tsx suppresses those for this route.
// Runs as its own independent SPA instance with its own WebSocket connection;
// it does not share state with the NetView tab that opened it.
const NetPaneWindow: React.FC = () => {
  const { netId, paneType } = useParams<{ netId: string; paneType: string }>();
  const { user } = useAuth();
  const [net, setNet] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [, setCheckIns] = useState<any[]>([]);
  const [, setActiveSpeakerId] = useState<number | null>(null);
  const [, setHighlightCheckIn] = useState(false);

  const fetchNet = async () => {
    try {
      const response = await netApi.get(Number(netId));
      setNet(response.data);
    } catch (error) {
      console.error('NetPaneWindow: failed to fetch net', error);
    }
  };

  useEffect(() => {
    fetchNet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netId]);

  useEffect(() => {
    const label = paneType === 'activity-log' ? 'Activity Log' : 'Chat';
    document.title = net?.name ? `${label} — ${net.name}` : `${label} — ECTLogger`;
  }, [paneType, net?.name]);

  // Own WebSocket connection — a popped-out window is a separate browsing
  // context and cannot share the opener tab's socket. fetchCheckIns /
  // fetchNetRoles / fetchNetStats are no-ops here since this page never
  // renders check-in or role data.
  useNetWebSocket({
    netId,
    user,
    fetchCheckIns: () => {},
    fetchNet,
    fetchNetRoles: () => {},
    fetchNetStats: () => {},
    setActiveSpeakerId,
    setCheckIns,
    setToastMessage,
    setHighlightCheckIn,
  });

  if (!net) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', width: '100vw', p: 0.5, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {paneType === 'activity-log' ? (
        <ActivityLog netId={Number(netId)} />
      ) : (
        <Chat
          netId={Number(netId)}
          netStartedAt={net.started_at}
          netStatus={net.status}
          canManage={!!net.can_manage}
          chatGracePeriodMinutes={net.chat_grace_period_minutes ?? undefined}
          closedAt={net.closed_at}
        />
      )}
      <Snackbar
        open={toastMessage !== ''}
        autoHideDuration={6000}
        onClose={() => setToastMessage('')}
        message={toastMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default NetPaneWindow;
