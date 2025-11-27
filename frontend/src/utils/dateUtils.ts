export const formatDateTime = (dateString: string, preferUtc: boolean = false): string => {
  // Backend sends UTC times without 'Z' suffix - append it so JavaScript parses correctly
  const normalizedDateString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
  const date = new Date(normalizedDateString);
  
  if (preferUtc) {
    return date.toUTCString();
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
