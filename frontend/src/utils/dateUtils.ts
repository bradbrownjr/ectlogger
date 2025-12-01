export const formatDateTime = (dateString: string, preferUtc: boolean = false): string => {
  // Backend sends UTC times without 'Z' suffix - append it so JavaScript parses correctly
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  if (preferUtc) {
    // toUTCString() returns "GMT" but we want to display "UTC"
    return date.toUTCString().replace('GMT', 'UTC');
  }
  
  // Get timezone abbreviation
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shortTimeZone = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short'
  }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  return `${date.toLocaleString()} ${shortTimeZone}`;
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

