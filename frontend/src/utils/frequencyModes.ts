// ========== FREQUENCY MODES ==========
// The one list of modes a shared frequency may have, used by every mode
// picker (Admin > Frequencies and the net/schedule Communication Plan tab).
// The server validates against FREQUENCY_MODES in backend/app/schemas.py;
// backend/tests/test_frequency_modes.py fails if the two lists drift.
//
// Until 2026-09-25 there were three hand-written copies that disagreed: the
// admin picker offered NXDN, M17, VARA, Winlink and Other, which the server
// rejected, and the net form offered neither AM nor CW.

// Which field identifies a frequency of this mode on the Communication Plan
// tab: a dial frequency, a digital network (plus talkgroup), or a YSF room.
export type FrequencyEntry = 'frequency' | 'network' | 'room';

export interface FrequencyMode {
  value: string;
  label: string;
  entry: FrequencyEntry;
}

export const FREQUENCY_MODES: FrequencyMode[] = [
  { value: 'FM', label: 'FM', entry: 'frequency' },
  { value: 'AM', label: 'AM', entry: 'frequency' },
  { value: 'SSB', label: 'SSB', entry: 'frequency' },
  { value: 'CW', label: 'CW', entry: 'frequency' },
  { value: 'GMRS', label: 'GMRS', entry: 'frequency' },
  { value: 'DMR', label: 'DMR', entry: 'network' },
  { value: 'D-STAR', label: 'D-STAR', entry: 'network' },
  { value: 'YSF', label: 'YSF (Fusion)', entry: 'room' },
  { value: 'P25', label: 'P25', entry: 'network' },
  { value: 'NXDN', label: 'NXDN', entry: 'network' },
  { value: 'M17', label: 'M17', entry: 'network' },
  { value: 'VARA', label: 'VARA', entry: 'frequency' },
  { value: 'Winlink', label: 'Winlink', entry: 'frequency' },
  { value: 'JS8Call', label: 'JS8Call', entry: 'frequency' },
  { value: 'Packet', label: 'Packet', entry: 'frequency' },
  // Any other digital mode on a frequency, e.g. FLDIGI's PSK31, Olivia, MT63.
  { value: 'Data', label: 'Data (FLDIGI and other digital)', entry: 'frequency' },
  { value: 'Other', label: 'Other', entry: 'frequency' },
];

export const frequencyEntryFor = (mode: string): FrequencyEntry =>
  FREQUENCY_MODES.find((m) => m.value === mode)?.entry ?? 'frequency';
