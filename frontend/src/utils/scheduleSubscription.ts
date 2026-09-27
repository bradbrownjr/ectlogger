import { templateApi } from '../services/api';
import { getErrorMessage } from './apiErrors';

/**
 * Subscribe to or unsubscribe from a schedule's notifications, alerting on
 * failure. Resolves true on success so the caller can refresh what it shows.
 * Shared by the Scheduler page and the Dashboard's net cards.
 */
export const setScheduleSubscription = async (scheduleId: number, subscribe: boolean): Promise<boolean> => {
  try {
    if (subscribe) await templateApi.subscribe(scheduleId);
    else await templateApi.unsubscribe(scheduleId);
    return true;
  } catch (error: any) {
    console.error(`Failed to ${subscribe ? 'subscribe' : 'unsubscribe'}:`, error);
    alert(getErrorMessage(error, `Failed to ${subscribe ? 'subscribe' : 'unsubscribe'}`));
    return false;
  }
};
