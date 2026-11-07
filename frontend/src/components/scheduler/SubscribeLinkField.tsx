import React from 'react';
import ShareLinkField from './ShareLinkField';
import { subscribeLink } from '../../utils/scheduleLinks';

interface SubscribeLinkFieldProps {
  scheduleId: number | string;
}

// ========== SUBSCRIBE LINK ==========
// The link staff share so people can subscribe to this schedule. Shared by
// the Staff dialog's Subscribers tab and the schedule editor's Net Staff
// tab, so it looks and behaves the same in both.

const SubscribeLinkField: React.FC<SubscribeLinkFieldProps> = ({ scheduleId }) => (
  <ShareLinkField
    link={subscribeLink(scheduleId)}
    label="Subscribe link"
    hint="Share this link to invite people to subscribe. They sign in first if they need to."
    copiedMessage="Subscribe link copied"
  />
);

export default SubscribeLinkField;
