import { CustomCalendarEvent, ReminderTiming } from '../types';
import { NowAR, getNowAR } from './dateAR';

export interface ReminderAlert {
  id: string; // unique reminder key: eventId_timing_date
  eventId: string;
  assetSymbol: string;
  action: string;
  eventDate: string;
  timing: ReminderTiming;
  title: string;
  message: string;
  daysRemaining: number;
  isUrgent: boolean;
}

/**
 * Calculates calendar day difference between two YYYY-MM-DD dates in Argentina.
 */
export function getDaysDiff(eventIsoDate: string, currentIsoDate: string): number {
  const [eY, eM, eD] = eventIsoDate.split('-').map(Number);
  const [cY, cM, cD] = currentIsoDate.split('-').map(Number);
  const eDate = new Date(Date.UTC(eY, eM - 1, eD));
  const cDate = new Date(Date.UTC(cY, cM - 1, cD));
  return Math.round((eDate.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Evaluates active custom events and returns triggered reminders based on getNowAR().
 */
export function checkReminders(
  customEvents: CustomCalendarEvent[],
  nowAR: NowAR = getNowAR(),
  dismissedReminderIds: string[] = []
): ReminderAlert[] {
  const alerts: ReminderAlert[] = [];

  for (const event of customEvents) {
    if (!event.reminders || event.reminders.length === 0) continue;

    const daysRemaining = getDaysDiff(event.date, nowAR.isoDate);

    // Skip past events (more than 1 day in the past)
    if (daysRemaining < 0) continue;

    const actionLabel = event.action.toUpperCase();

    for (const timing of event.reminders) {
      let isDue = false;

      if (timing === 'same_day' && daysRemaining === 0) {
        isDue = true;
      } else if (timing === '1_day_before' && daysRemaining === 1) {
        isDue = true;
      } else if (timing === '3_days_before' && daysRemaining === 3) {
        isDue = true;
      } else if (timing === '1_week_before' && daysRemaining === 7) {
        isDue = true;
      }

      if (isDue) {
        const reminderId = `${event.id}_${timing}_${event.date}`;

        // Don't repeat if user already dismissed this reminder
        if (dismissedReminderIds.includes(reminderId)) continue;
        if (event.remindedTimes && event.remindedTimes.includes(reminderId)) continue;

        let timeMsg = '¡Es hoy!';
        if (daysRemaining === 1) timeMsg = 'Es mañana (en 24 hs)';
        else if (daysRemaining > 1) timeMsg = `Vence en ${daysRemaining} días (${event.date})`;

        alerts.push({
          id: reminderId,
          eventId: event.id,
          assetSymbol: event.assetSymbol,
          action: event.action,
          eventDate: event.date,
          timing,
          title: `Recordatorio: ${actionLabel} ${event.assetSymbol}`,
          message: `${timeMsg}${event.note ? ` · Nota: ${event.note}` : ''}`,
          daysRemaining,
          isUrgent: daysRemaining <= 1
        });
      }
    }
  }

  return alerts;
}
