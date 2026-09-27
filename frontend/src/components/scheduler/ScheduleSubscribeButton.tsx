import React from 'react';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import CardActionButton from '../CardActionButton';

interface ScheduleSubscribeButtonProps {
  isSubscribed: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}

// ========== SCHEDULE SUBSCRIBE BUTTON ==========
// Subscribe/Unsubscribe card button for a schedule's notifications. Shared by
// ScheduleCard and NetCard (a net card subscribes to the net's schedule), so
// the control looks identical wherever a schedule's nets appear.

const ScheduleSubscribeButton: React.FC<ScheduleSubscribeButtonProps> = ({
  isSubscribed,
  onSubscribe,
  onUnsubscribe,
}) => (
  isSubscribed ? (
    <CardActionButton
      icon={<NotificationsActiveIcon />}
      label="Unsubscribe"
      color="primary"
      tooltip="Unsubscribe from notifications"
      onClick={onUnsubscribe}
    />
  ) : (
    <CardActionButton
      icon={<NotificationsOffIcon />}
      label="Subscribe"
      tooltip="Subscribe to notifications"
      onClick={onSubscribe}
    />
  )
);

export default ScheduleSubscribeButton;
