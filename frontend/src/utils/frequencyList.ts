// One-line label for a net's or schedule's frequencies, as shown on cards and
// list rows: "146.520, 146.940 −0.600 PL 100.0, DMR TG3123, YSF". Shared so
// every place a net's frequencies appear reads the same way. A repeater's
// offset and tone come from utils/channelPlan.ts::frequencyDetails, the one
// formatter every frequency chip uses.
import { FrequencyRadioFields, withFrequencyDetails } from './channelPlan';

interface FrequencyLike extends FrequencyRadioFields {
  frequency?: string | null;
  network?: string | null;
  talkgroup?: string | null;
}

export function formatFrequencyList(frequencies: FrequencyLike[]): string {
  return frequencies
    .map((f) => {
      if (f.frequency) return withFrequencyDetails(f.frequency, f);
      if (f.network && f.talkgroup) return `${f.network} TG${f.talkgroup}`;
      if (f.network) return f.network;
      return '';
    })
    .filter((s) => s)
    .join(', ');
}

// One frequency as plain text: "147.090 MHz (FM)", or for a digital mode
// with no frequency its channel or talkgroup ("UFB YSF", "NEDECON TG7123
// DMR"). Used where the text is a value (pickers, the CSV template's sample
// row, off-net channel suggestions); a chip uses formatFrequencyChip.
export function formatFrequencyDisplay(freq: any): string {
  if (!freq) return '';
  if (freq.frequency) {
    return `${freq.frequency} MHz${freq.mode ? ` (${freq.mode})` : ''}`;
  }
  const label = freq.channel || freq.talkgroup || 'Digital';
  return freq.mode ? `${label} ${freq.mode}` : label;
}

// A check-in table or Net Info chip: formatFrequencyDisplay plus the
// repeater's offset and tone ("146.940 MHz (FM) −0.600 PL 100.0").
export function formatFrequencyChip(freq: any): string {
  return withFrequencyDetails(formatFrequencyDisplay(freq), freq);
}

// The net header's frequency chips: "146.940 MHz FM −0.600 PL 100.0", or a
// talkgroup with its network ("Brandmeister TG3123 DMR").
export function formatHeaderFrequencyChip(freq: any): string {
  if (!freq) return '';
  const label = freq.frequency
    ? `${freq.frequency} MHz ${freq.mode || ''}`.trim()
    : `${freq.network || ''}${freq.talkgroup ? ` TG${freq.talkgroup}` : ''} ${freq.mode || ''}`.trim();
  return withFrequencyDetails(label, freq);
}
