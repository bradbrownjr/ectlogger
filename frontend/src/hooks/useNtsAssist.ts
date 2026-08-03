import { useEffect, useState } from 'react';

// TEMPORARY STUB: frontend/src/utils/ntsText.ts is being ported concurrently
// by another agent (normalizeNtsText / countNtsCheck / normalizeAndCount,
// mirroring backend/app/traffic/nts_text.py). It did not exist yet when this
// hook was written, so a minimal local copy of the same logic lives here
// instead of blocking on it. Once that file lands: delete the block below
// down to (and including) `normalizeAndCount`, and replace it with
// `import { normalizeAndCount } from '../utils/ntsText';`

const NTS_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/(\d)[.:/](\d)/g, '$1R$2'],
  [/'/g, ''],
  [/&/g, ' AND '],
  [/@/g, ' AT '],
  [/\?/g, ' QUERY '],
  [/[()]/g, ' '],
  [/(\w)\s*-\s*(\w)/g, '$1 X $2'],
  [/-/g, ' '],
  [/[.,!;:]/g, ' X '],
];

function normalizeNtsText(text: string): string {
  let t = text.toUpperCase().trim();
  t = t.replace(/[.,!?;:\s]+$/, '').trim();
  for (const [pattern, replacement] of NTS_SUBSTITUTIONS) {
    t = t.replace(pattern, replacement);
  }
  t = t.replace(/ {2,}/g, ' ').trim();
  const words = t.split(/\s+/).filter(Boolean);
  while (words.length && (words[words.length - 1] === 'X' || words[words.length - 1] === 'QUERY')) {
    words.pop();
  }
  return words.join(' ');
}

function countNtsCheck(text: string): number {
  let t = text.toUpperCase().trim();
  t = t.replace(/(\d)\.(\d)/g, '$1$2');
  t = t.replace(/[^\w\s]/g, ' ');
  t = t.replace(/ {2,}/g, ' ').trim();
  let count = 0;
  for (const w of t.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(w)) {
      count += Math.ceil(w.length / 5);
    } else {
      count += 1;
    }
  }
  return count;
}

function normalizeAndCount(text: string): { normalized: string; check: number } {
  const normalized = normalizeNtsText(text);
  const check = countNtsCheck(normalized);
  return { normalized, check };
}

// ========== useNtsAssist ==========
// Live, debounced NTS normalization preview + check (word count) for the
// radiogram "text" field. Preview only: POST/PATCH /traffic/forms always
// recompute from text_raw server-side, and that result is the one that gets
// stored -- this hook exists purely so the operator can see, before
// submitting, what the server is about to compute. See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 3.2 and section 4.4.
export function useNtsAssist(text: string, debounceMs = 250) {
  const [result, setResult] = useState(() => normalizeAndCount(text));

  useEffect(() => {
    const handle = setTimeout(() => {
      setResult(normalizeAndCount(text));
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [text, debounceMs]);

  return result;
}

export default useNtsAssist;
