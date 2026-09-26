export const formatDateTime = (dateString: string, preferUtc: boolean = false): string => {
  // Backend sends UTC times without 'Z' suffix - append it so JavaScript parses correctly
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  if (preferUtc) {
    // toUTCString() returns "GMT" but we want to display "UTC"
    return date.toUTCString().replace('GMT', 'UTC');
  }
  
  // Get timezone abbreviation
  void Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  return `${date.toLocaleString()} ${shortTimeZone}`;
};

/**
 * Format just the date portion (for compact display with full datetime on hover)
 */
export const formatDate = (dateString: string, preferUtc: boolean = false): string => {
  // Backend sends UTC times without 'Z' suffix - append it so JavaScript parses correctly
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  if (preferUtc) {
    // Format as "Dec 19, 2025" in UTC
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'UTC'
    });
  }
  
  return date.toLocaleDateString();
};

export const formatTime = (dateString: string, preferUtc: boolean = false): string => {
  // Backend sends UTC times without 'Z' suffix - append it so JavaScript parses correctly
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  if (preferUtc) {
    return date.toUTCString().split(' ')[4] + ' UTC'; // Extract just the time part
  }
  
  // Get timezone abbreviation
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  return `${date.toLocaleTimeString()} ${shortTimeZone}`;
};

/**
 * Format time, including date if it differs from the reference date (for multi-day nets)
 */
export const formatTimeWithDate = (
  dateString: string, 
  preferUtc: boolean = false,
  referenceDate?: string
): string => {
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  // Check if we need to show the date (different day from reference)
  let showDate = false;
  if (referenceDate) {
    const normalizedRefDate = referenceDate.endsWith('Z') ? referenceDate : referenceDate + 'Z';
    const refDate = new Date(normalizedRefDate);
    
    if (preferUtc) {
      showDate = date.toISOString().split('T')[0] !== refDate.toISOString().split('T')[0];
    } else {
      showDate = date.toLocaleDateString() !== refDate.toLocaleDateString();
    }
  }
  
  if (preferUtc) {
    if (showDate) {
      // Show date and time: "Nov 28 14:30 UTC"
      const parts = date.toUTCString().split(' ');
      return `${parts[2]} ${parts[1]} ${parts[4]} UTC`;
    }
    return date.toUTCString().split(' ')[4] + ' UTC';
  }
  
  // Get timezone abbreviation
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  if (showDate) {
    // Show short date and time: "11/28 2:30:00 PM EST"
    const shortDate = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    return `${shortDate} ${date.toLocaleTimeString()} ${shortTimeZone}`;
  }
  
  return `${date.toLocaleTimeString()} ${shortTimeZone}`;
};


// ========== REPORT MASTHEAD DATES ==========

const toDate = (dateString: string): Date =>
  new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');

/**
 * The date line under a report's title: `when` is the long date the net ran
 * ("Monday, September 21, 2026"), `detail` the time span ("5:52 – 6:23 PM EDT").
 * A net that closed on a later day names the end date in the span.
 */
export const formatReportSpan = (
  start: string,
  end: string | null | undefined,
  preferUtc: boolean = false
): { when: string; detail: string } => {
  const tz = preferUtc ? { timeZone: 'UTC' } : {};
  const s = toDate(start);
  const when = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', ...tz });
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...tz });
  const zone = preferUtc
    ? 'UTC'
    : new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(s).find(p => p.type === 'timeZoneName')?.value || '';
  if (!end) {
    return { when, detail: `Started ${time(s)} ${zone}` };
  }
  const e = toDate(end);
  const dayKey = (d: Date) => d.toLocaleDateString('en-US', tz);
  if (dayKey(s) !== dayKey(e)) {
    const endDay = e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...tz });
    return { when, detail: `${time(s)} – ${endDay}, ${time(e)} ${zone}` };
  }
  return { when, detail: `${time(s)} – ${time(e)} ${zone}` };
};

/** Short date for a PDF page footer: "Sep 21, 2026". */
export const formatReportShortDate = (dateString: string, preferUtc: boolean = false): string =>
  toDate(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', ...(preferUtc ? { timeZone: 'UTC' } : {}),
  });
