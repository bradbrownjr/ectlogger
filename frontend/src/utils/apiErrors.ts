// Extracts a human-readable message from an Axios error response, falling
// back to a caller-supplied default when the backend didn't send a `detail`.
export function getErrorMessage(err: any, fallback: string): string {
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((e: any) => e.msg || String(e)).join(', ');
  }
  return fallback;
}
