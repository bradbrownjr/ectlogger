// Extracts a human-readable message from an Axios error response, falling
// back to a caller-supplied default when the backend didn't send a `detail`.
export function getErrorMessage(err: any, fallback: string): string {
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  // A coded refusal, e.g. { code: 'schedule_requirements_not_met', message }
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && typeof detail.message === 'string') {
    return detail.message;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic prefixes a validator's own message with "Value error, ",
    // which reads as noise to an operator.
    return detail
      .map((e: any) => (e.msg ? String(e.msg).replace(/^Value error, /, '') : String(e)))
      .join(', ');
  }
  return fallback;
}
