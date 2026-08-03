import { useEffect, useState } from 'react';
import { normalizeAndCount } from '../utils/ntsText';

// ========== useNtsAssist ==========
// Live, debounced NTS normalization preview + check (word count) for the
// radiogram "text" field. Preview only: POST/PATCH /traffic/forms always
// recompute from text_raw server-side, and that result is the one that gets
// stored -- this hook exists purely so the operator can see, before
// submitting, what the server is about to compute. See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.2 and section 4.4.
function toResult(text: string): { normalized: string; check: number } {
  const [normalized, check] = normalizeAndCount(text);
  return { normalized, check };
}

export function useNtsAssist(text: string, debounceMs = 250) {
  const [result, setResult] = useState(() => toResult(text));

  useEffect(() => {
    const handle = setTimeout(() => {
      setResult(toResult(text));
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [text, debounceMs]);

  return result;
}

export default useNtsAssist;
