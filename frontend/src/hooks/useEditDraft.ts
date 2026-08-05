import { useEffect, useState } from 'react';

// ========== useEditDraft ==========
// An in-progress inline edit (the net script, a net's announcements, a
// schedule's announcements) that survives its component being remounted.
//
// Those panels are rendered twice in NetView: a docked version inside the
// left column and a floating version, switched by `docked && isXlUp`. That
// switch is automatic, so a window resize -- or plugging a laptop into a
// projector -- crosses the xl breakpoint, unmounts one subtree, mounts the
// other, and used to discard whatever was half-typed. Mirroring the buffer
// into sessionStorage means the new instance picks the edit back up.
//
// sessionStorage, not localStorage: an unsaved edit belongs to this tab and
// this sitting, and should not reappear in a new one weeks later. The entry
// is removed the moment editing ends, whether by saving or cancelling, so a
// draft only ever outlives a remount.
//
// Drop-in for the `useState` pair it replaces: the setters are ordinary
// state setters, and persistence happens in an effect rather than in
// wrappers, so callers need no changes beyond the hook call itself.

const PREFIX = 'ect-edit-draft:';

function readDraft(key: string | null): string | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.value === 'string' ? parsed.value : null;
  } catch {
    // Unparseable or unavailable storage is not worth failing an edit over.
    return null;
  }
}

export function useEditDraft(key: string | null, serverValue: string) {
  // A stored draft means the previous instance was mid-edit, so this one
  // opens in edit mode holding it.
  const [editing, setEditing] = useState(() => readDraft(key) !== null);
  const [editValue, setEditValue] = useState(() => readDraft(key) ?? serverValue);

  useEffect(() => {
    if (!key) return;
    try {
      if (editing) sessionStorage.setItem(PREFIX + key, JSON.stringify({ value: editValue }));
      else sessionStorage.removeItem(PREFIX + key);
    } catch {
      // Private browsing or a full quota: the edit still works, it just
      // won't survive a remount.
    }
  }, [key, editing, editValue]);

  // The key often arrives a render or two after mount (it is derived from a
  // net or template that is still loading), too late for the initializers
  // above -- so pick the draft up when it does.
  useEffect(() => {
    const stored = readDraft(key);
    if (stored !== null) {
      setEditValue(stored);
      setEditing(true);
    }
    // Only on a key change: `editing`/`editValue` here would re-run this on
    // every keystroke, and a cancelled edit (entry already removed) would
    // never be resurrected anyway.
  }, [key]);

  return { editing, setEditing, editValue, setEditValue };
}

export default useEditDraft;
