// ========== COVERAGE FREQUENCY LABELS ==========
// How the map's coverage overlay and the Station Coverage panel name a net's
// frequencies, built once for every place they appear (Net View's docked and
// floating panels and the popped-out windows), which used to each carry a copy.

interface NetFrequency {
  id: number;
  frequency?: string | null;
  network?: string | null;
  mode?: string | null;
  band?: string | null;
  description?: string | null;
}

// id -> "146.520 FM"
export function coverageFrequencyLabels(frequencies: NetFrequency[] | undefined): Record<number, string> {
  return Object.fromEntries(
    (frequencies || []).map((f) => [f.id, `${f.frequency || f.network || ''} ${f.mode || ''}`.trim()])
  );
}

// The panel's frequency-correction choices. Includes the band (e.g. "(2m)"),
// the detail that tells a net's frequencies apart at a glance, matching
// CanHearDialog.tsx's own frequencyLabel().
export function coverageFrequencyOptions(frequencies: NetFrequency[] | undefined): { id: number; label: string }[] {
  return (frequencies || []).map((f) => {
    const base = `${f.frequency || f.network || ''} ${f.mode || ''}`.trim() || f.description || `Frequency #${f.id}`;
    return { id: f.id, label: f.band ? `${base} (${f.band})` : base };
  });
}
