// One-line label for a net's or schedule's frequencies, as shown on cards and
// list rows: "146.520, DMR TG3123, YSF". Shared so every place a net's
// frequencies appear reads the same way.
interface FrequencyLike {
  frequency?: string | null;
  network?: string | null;
  talkgroup?: string | null;
}

export function formatFrequencyList(frequencies: FrequencyLike[]): string {
  return frequencies
    .map((f) => {
      if (f.frequency) return f.frequency;
      if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
      if (f.network) return f.network;
      return '';
    })
    .filter((s) => s)
    .join(', ');
}
