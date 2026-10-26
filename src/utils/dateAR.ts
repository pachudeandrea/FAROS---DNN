/**
 * Unified Argentina Date & Time module for FAROS
 * Timezone: America/Argentina/Buenos_Aires (UTC-3, no DST)
 */

export interface NowAR {
  date: Date;
  year: number;
  month: number; // 0-indexed (0 = Enero, 9 = Octubre)
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string; // YYYY-MM-DD
  isoMonth: string; // YYYY-MM
  dayOfWeek: string; // e.g. "martes"
  formattedSpanish: string; // e.g. "martes, 20 de octubre de 2026"
  formattedDisplay: string; // e.g. "20/10/2026 14:15"
  headerUpdatedText: string; // "Actualizado: 20/10/2026 14:15 (hora Argentina)"
  timestamp: number;
  msUntilNextMidnight: number;
}

// Global simulation offset in days (for testing simulated day change)
let simulatedOffsetDays = 0;

export function setSimulatedDayOffset(offset: number): void {
  simulatedOffsetDays = offset;
}

export function getSimulatedDayOffset(): number {
  return simulatedOffsetDays;
}

/**
 * Returns current date and time strictly in the America/Argentina/Buenos_Aires timezone.
 * Single source of truth for both frontend and backend.
 */
export function getNowAR(customDate?: Date): NowAR {
  const baseDate = customDate ? new Date(customDate.getTime()) : new Date();

  // Apply simulated day offset if set (for testing day rollover)
  if (simulatedOffsetDays !== 0 && !customDate) {
    baseDate.setTime(baseDate.getTime() + simulatedOffsetDays * 86400000);
  }

  const timeZone = 'America/Argentina/Buenos_Aires';

  // Format parts
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(baseDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);

  const mmStr = String(month + 1).padStart(2, '0');
  const ddStr = String(day).padStart(2, '0');
  const HHStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');

  const isoDate = `${year}-${mmStr}-${ddStr}`;
  const isoMonth = `${year}-${mmStr}`;
  const formattedDisplay = `${ddStr}/${mmStr}/${year} ${HHStr}:${minStr}`;
  const headerUpdatedText = `Actualizado: ${formattedDisplay} (hora Argentina)`;

  const dayOfWeek = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    weekday: 'long'
  }).format(baseDate);

  const formattedSpanish = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(baseDate);

  // Calculate ms until next midnight in Argentina
  const secondsLeftToday = (23 - hour) * 3600 + (59 - minute) * 60 + (60 - second);
  const msUntilNextMidnight = Math.max(1000, secondsLeftToday * 1000);

  return {
    date: baseDate,
    year,
    month,
    day,
    hour,
    minute,
    second,
    isoDate,
    isoMonth,
    dayOfWeek,
    formattedSpanish,
    formattedDisplay,
    headerUpdatedText,
    timestamp: baseDate.getTime(),
    msUntilNextMidnight
  };
}
