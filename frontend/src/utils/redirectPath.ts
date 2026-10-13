// Where to go after sign-in, read from a `?redirect=` query parameter. Only a
// path inside this app is honoured, so a crafted link can never use sign-in to
// send someone to another site. Mirrors backend/app/utils.py::safe_redirect_path.
export const safeRedirectPath = (value: string | null | undefined): string | null => {
  if (!value || value.length > 300) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
};
