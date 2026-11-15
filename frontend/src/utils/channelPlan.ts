// ========== CHANNEL PLAN AND ICS-205 ==========
// One place that knows how a frequency's repeater details read and how a
// net's channel plan becomes FEMA's ICS 205 (Incident Radio Communications
// Plan, v3.1). Used by every frequency chip in the net view
// (frequencyList.ts), the Communication Plan tab's channel plan editor
// (components/forms/ChannelPlanEditor.tsx), and the ICS-205 page and its
// PDF (pages/Ics205.tsx, components/ics205/ICS205PrintView.tsx). Pure, so
// the rules are unit-tested (channelPlan.test.ts).
//
// Stored shapes (migration 102, PROGRESS.md "P3 contract"):
//   Frequency.offset     signed MHz, "-0.600" or "+5.000"; empty is simplex
//   Frequency.tx_tone    CTCSS "100.0", DCS "D023" or "NAC 293"
//   Frequency.rx_tone    same formats
//   Frequency.bandwidth  'N' or 'W'
//   channel_plan         [{frequency_id, plan_role, ics_function,
//                          assignment, remarks}], list order is the position

import { frequencyEntryFor } from './frequencyModes';

// ---- Types ----

export interface FrequencyRadioFields {
  offset?: string | null;
  tx_tone?: string | null;
  rx_tone?: string | null;
  bandwidth?: string | null;
}

export interface PlanFrequency extends FrequencyRadioFields {
  id?: number;
  frequency?: string | null;
  mode: string;
  network?: string | null;
  talkgroup?: string | null;
  description?: string | null;
}

export type PlanRole = 'primary' | 'alternate' | 'contingency' | 'emergency';
export type IcsFunction = 'command' | 'tactical' | 'ground_to_air' | 'air_to_air' | 'support' | 'dispatch';

export interface ChannelPlanEntry {
  frequency_id: number;
  plan_role: PlanRole | null;
  ics_function: IcsFunction | null;
  assignment: string | null;
  remarks: string | null;
}

// PACE order (primary, alternate, contingency, emergency)
export const PLAN_ROLES: { value: PlanRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'alternate', label: 'Alternate' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'emergency', label: 'Emergency' },
];

// Block 4's Function column, worded as FEMA prints it
export const ICS_FUNCTIONS: { value: IcsFunction; label: string }[] = [
  { value: 'command', label: 'Command' },
  { value: 'tactical', label: 'Tactical' },
  { value: 'ground_to_air', label: 'Ground-to-Air' },
  { value: 'air_to_air', label: 'Air-to-Air' },
  { value: 'support', label: 'Support' },
  { value: 'dispatch', label: 'Dispatch' },
];

export const DEFAULT_ICS_FUNCTION: IcsFunction = 'tactical';

export const planRoleLabel = (role: string | null | undefined): string =>
  PLAN_ROLES.find((r) => r.value === role)?.label ?? '';

export const icsFunctionLabel = (fn: string | null | undefined): string =>
  ICS_FUNCTIONS.find((f) => f.value === fn)?.label ?? '';

// ---- Tone choices ----
// The tone pickers offer only these, so a typo can't reach the ICS-205
// (DESIGN.md "Fixed-answer fields"). The server validates against the same
// lists, with their sources (backend/app/services/channel_plan.py); keep the
// two in step.

// The usual 50-tone CTCSS list, in Hz
export const CTCSS_TONES: string[] = [
  '67.0', '69.3', '71.9', '74.4', '77.0', '79.7', '82.5', '85.4', '88.5', '91.5',
  '94.8', '97.4', '100.0', '103.5', '107.2', '110.9', '114.8', '118.8', '123.0', '127.3',
  '131.8', '136.5', '141.3', '146.2', '151.4', '156.7', '159.8', '162.2', '165.5', '167.9',
  '171.3', '173.8', '177.3', '179.9', '183.5', '186.2', '189.9', '192.8', '196.6', '199.5',
  '203.5', '206.5', '210.7', '218.1', '225.7', '229.1', '233.6', '241.8', '250.3', '254.1',
];

// The 104 standard DCS codes, written as radios show them ("D023")
export const DCS_CODES: string[] = [
  '023', '025', '026', '031', '032', '036', '043', '047', '051', '053',
  '054', '065', '071', '072', '073', '074', '114', '115', '116', '122',
  '125', '131', '132', '134', '143', '145', '152', '155', '156', '162',
  '165', '172', '174', '205', '212', '223', '225', '226', '243', '244',
  '245', '246', '251', '252', '255', '261', '263', '265', '266', '271',
  '274', '306', '311', '315', '325', '331', '332', '343', '346', '351',
  '356', '364', '365', '371', '411', '412', '413', '423', '431', '432',
  '445', '446', '452', '454', '455', '462', '464', '465', '466', '503',
  '506', '516', '523', '526', '532', '546', '565', '606', '612', '624',
  '627', '631', '632', '654', '662', '664', '703', '712', '723', '731',
  '732', '734', '743', '754',
].map((code) => `D${code}`);

// A P25 Network Access Code: 12 bits, written as three hex digits ("NAC 293")
let nacCodes: string[] | null = null;
export const nacOptions = (): string[] => {
  if (!nacCodes) {
    nacCodes = Array.from({ length: 4096 }, (_, n) => `NAC ${n.toString(16).toUpperCase().padStart(3, '0')}`);
  }
  return nacCodes;
};

export type ToneGroup = 'CTCSS' | 'DCS' | 'NAC';

export interface ToneOption {
  value: string;
  group: ToneGroup;
}

// Which repeater fields a frequency of this mode has. Offset and N/W go with
// a dial frequency; tones go with analog FM-style modes and P25 (its NAC).
export const radioFieldsFor = (mode: string): { offset: boolean; bandwidth: boolean; tones: boolean } => {
  const onFrequency = frequencyEntryFor(mode) === 'frequency';
  return {
    offset: onFrequency,
    bandwidth: onFrequency,
    tones: onFrequency || mode === 'P25',
  };
};

export const toneOptionsFor = (mode: string): ToneOption[] => {
  if (mode === 'P25') return nacOptions().map((value) => ({ value, group: 'NAC' }));
  return [
    ...CTCSS_TONES.map((value) => ({ value, group: 'CTCSS' as const })),
    ...DCS_CODES.map((value) => ({ value, group: 'DCS' as const })),
  ];
};

// Fields a mode doesn't have are sent as null, so a frequency switched from
// FM to DMR doesn't keep its old offset.
export const radioFieldsPayload = (mode: string, f: FrequencyRadioFields) => {
  const fields = radioFieldsFor(mode);
  return {
    offset: fields.offset && f.offset ? f.offset.trim() || null : null,
    tx_tone: fields.tones && f.tx_tone ? f.tx_tone : null,
    rx_tone: fields.tones && f.rx_tone ? f.rx_tone : null,
    bandwidth: fields.bandwidth && f.bandwidth ? f.bandwidth : null,
  };
};

// ---- Chip details ----

const parseMhz = (value: string | null | undefined): number | null => {
  if (value == null) return null;
  const n = parseFloat(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * An offset as a chip shows it: "−0.600" (a real minus sign) or "+5.000".
 * Blank or zero is simplex and reads as nothing.
 */
export const formatOffset = (offset: string | null | undefined): string => {
  if (!offset || !offset.trim()) return '';
  const n = parseMhz(offset);
  if (n == null) return offset.trim();
  if (n === 0) return '';
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(3)}`;
};

/** A tone as a chip shows it: CTCSS "PL 100.0"; DCS and NAC as stored. */
export const formatTone = (tone: string | null | undefined): string => {
  if (!tone || !tone.trim()) return '';
  const t = tone.trim();
  return /^\d+(\.\d+)?$/.test(t) ? `PL ${t}` : t;
};

/**
 * What a frequency chip adds after its label: the offset, then the TX tone
 * (what a station sends to open the repeater), then the RX tone when it
 * differs, then N or W. "−0.600 PL 100.0 W". Nothing for simplex with no
 * tone and no N/W. Every chip, the Communication Plan table and the channel
 * plan editor show these same details.
 */
export const frequencyDetails = (f: FrequencyRadioFields | null | undefined): string => {
  if (!f) return '';
  const parts = [formatOffset(f.offset), formatTone(f.tx_tone)];
  if (f.rx_tone && f.rx_tone.trim() && f.rx_tone.trim() !== (f.tx_tone || '').trim()) {
    parts.push(`RX ${formatTone(f.rx_tone)}`);
  }
  if (f.bandwidth === 'N' || f.bandwidth === 'W') parts.push(f.bandwidth);
  return parts.filter(Boolean).join(' ');
};

/** A chip's label with the frequency's details appended. */
export const withFrequencyDetails = (label: string, f: FrequencyRadioFields | null | undefined): string => {
  const details = frequencyDetails(f);
  return details ? `${label} ${details}` : label;
};

// ---- Repeater hint ----
// Repeater output ranges from the ARRL band plan (https://www.arrl.org/band-plan,
// read 2026-11-15). 70 cm lists 442-445 and 447-450 as "inputs and outputs
// (local option)", so both whole ranges count. GMRS repeater outputs are
// channels 15R-22R, 462.550-462.725 MHz (47 CFR 95.1763). A rough guide for
// the hint only: a channel here with no offset or tone was probably entered
// before those fields existed.
const REPEATER_OUTPUTS_MHZ: [number, number][] = [
  [29.61, 29.7],
  [51.62, 51.98],
  [52.5, 52.98],
  [53.5, 53.98],
  [145.2, 145.5],
  [146.61, 147.39],
  [223.85, 224.98],
  [442.0, 445.0],
  [447.0, 450.0],
  [462.55, 462.725],
];

export const looksLikeRepeater = (f: PlanFrequency): boolean => {
  if (f.mode !== 'FM' && f.mode !== 'GMRS') return false;
  if (formatOffset(f.offset) || (f.tx_tone && f.tx_tone.trim())) return false;
  if (/repeater|rptr/i.test(f.description || '')) return true;
  const mhz = parseMhz(f.frequency);
  return mhz != null && REPEATER_OUTPUTS_MHZ.some(([lo, hi]) => mhz >= lo - 1e-6 && mhz <= hi + 1e-6);
};

// ---- Plan editing ----

export const newPlanEntry = (frequencyId: number): ChannelPlanEntry => ({
  frequency_id: frequencyId,
  plan_role: null,
  ics_function: DEFAULT_ICS_FUNCTION,
  assignment: null,
  remarks: null,
});

/**
 * Keep the plan in step with the selected frequencies: an unselected one is
 * dropped, a newly selected one goes on the end. Returns the same array when
 * nothing changed.
 */
export const syncChannelPlan = (plan: ChannelPlanEntry[], selectedIds: number[]): ChannelPlanEntry[] => {
  const selected = new Set(selectedIds);
  const kept = plan.filter((e) => selected.has(e.frequency_id));
  const inPlan = new Set(kept.map((e) => e.frequency_id));
  const added = selectedIds.filter((id, i) => !inPlan.has(id) && selectedIds.indexOf(id) === i).map(newPlanEntry);
  if (added.length === 0 && kept.length === plan.length) return plan;
  return [...kept, ...added];
};

/** Move one entry up (-1) or down (+1); a move off either end does nothing. */
export const moveEntry = <T>(list: T[], index: number, delta: -1 | 1): T[] => {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

/** The plan as the API takes it: blank text as null. */
export const channelPlanPayload = (plan: ChannelPlanEntry[]): ChannelPlanEntry[] =>
  plan.map((e) => ({
    frequency_id: e.frequency_id,
    plan_role: e.plan_role || null,
    ics_function: e.ics_function || null,
    assignment: e.assignment?.trim() || null,
    remarks: e.remarks?.trim() || null,
  }));

// ---- ICS 205 block 4 ----

/** Block 4's Mode column: A for analog, D for digital, blank otherwise. */
const ANALOG_MODES = new Set(['FM', 'AM', 'SSB', 'CW', 'GMRS']);
const DIGITAL_MODES = new Set(['DMR', 'D-STAR', 'YSF', 'P25', 'NXDN', 'M17', 'VARA', 'Winlink', 'Packet', 'JS8Call', 'Data']);
export const icsMode = (mode: string): 'A' | 'D' | '' =>
  ANALOG_MODES.has(mode) ? 'A' : DIGITAL_MODES.has(mode) ? 'D' : '';

const withBandwidth = (mhz: number | null, bandwidth: string | null | undefined): string => {
  if (mhz == null) return '';
  const suffix = bandwidth === 'N' || bandwidth === 'W' ? ` ${bandwidth}` : '';
  return `${mhz.toFixed(4)}${suffix}`;
};

/** RX Freq: the listed frequency, four decimals, then N or W. */
export const rxFrequency = (f: PlanFrequency): string => withBandwidth(parseMhz(f.frequency), f.bandwidth);

/** TX Freq: the listed frequency plus the offset (the repeater's input). */
export const txFrequency = (f: PlanFrequency): string => {
  const rx = parseMhz(f.frequency);
  if (rx == null) return '';
  const offset = f.offset ? parseMhz(f.offset) ?? 0 : 0;
  return withBandwidth(Math.round((rx + offset) * 1e6) / 1e6, f.bandwidth);
};

/** Channel Name/Talkgroup. A digital network leads with its network and
 * talkgroup, since that is what a radio is programmed with, followed by the
 * description in brackets; anything else is its description, or the
 * frequency and mode when it has none. */
export const channelName = (f: PlanFrequency): string => {
  const description = (f.description || '').trim();
  if (f.network) {
    const system = f.talkgroup ? `${f.network} TG ${f.talkgroup}` : f.network;
    return description ? `${system} (${description})` : system;
  }
  if (description) return description;
  return [f.frequency, f.mode].filter(Boolean).join(' ');
};

export interface Ics205Row {
  key: number;
  zone: string;
  channel: number;
  fn: string;
  name: string;
  assignment: string;
  rxFreq: string;
  rxTone: string;
  txFreq: string;
  txTone: string;
  mode: string;
  remarks: string;
}

// Block 4's columns in FEMA's order, headed as PROGRESS.md's research names
// them, with their share of the page width. Shared by the page and the PDF.
export const ICS205_COLUMNS: { key: keyof Ics205Row; heading: string; width: string; nowrap?: boolean }[] = [
  { key: 'zone', heading: 'Zone Grp', width: '5%' },
  { key: 'channel', heading: 'Ch #', width: '4%' },
  { key: 'fn', heading: 'Function', width: '8%' },
  { key: 'name', heading: 'Channel Name/Talkgroup', width: '15%' },
  { key: 'assignment', heading: 'Assignment', width: '13%' },
  { key: 'rxFreq', heading: 'RX Freq N/W', width: '9%', nowrap: true },
  { key: 'rxTone', heading: 'RX Tone/NAC', width: '7%' },
  { key: 'txFreq', heading: 'TX Freq N/W', width: '9%', nowrap: true },
  { key: 'txTone', heading: 'TX Tone/NAC', width: '7%' },
  { key: 'mode', heading: 'Mode (A/D/M)', width: '5%' },
  { key: 'remarks', heading: 'Remarks', width: '18%' },
];

/**
 * Block 4 rows in plan order. Zone Grp is left blank: FEMA leaves zone and
 * channel numbers to the Communications Unit Leader, and we don't know how
 * anyone's radios are zoned, so it's written in by hand. Ch # is the plan's
 * line number, counting from 1, which FEMA allows ("a reference line number
 * on the ICS 205 document"). An entry whose frequency isn't on the net is
 * left out.
 */
export const buildIcs205Rows = (plan: ChannelPlanEntry[], frequencies: PlanFrequency[]): Ics205Row[] => {
  const byId = new Map(frequencies.filter((f) => f.id != null).map((f) => [f.id as number, f]));
  return plan
    .filter((e) => byId.has(e.frequency_id))
    .map((e, i) => {
      const f = byId.get(e.frequency_id)!;
      return {
        key: e.frequency_id,
        zone: '',
        channel: i + 1,
        fn: icsFunctionLabel(e.ics_function),
        name: channelName(f),
        assignment: e.assignment || '',
        rxFreq: rxFrequency(f),
        rxTone: (f.rx_tone || '').trim(),
        txFreq: txFrequency(f),
        txTone: (f.tx_tone || '').trim(),
        mode: icsMode(f.mode),
        remarks: [planRoleLabel(e.plan_role), (e.remarks || '').trim()].filter(Boolean).join('; '),
      };
    });
};

// ---- ICS 205 block 6 ----

/**
 * Block 6, Prepared by: the net's primary NCS, the first in
 * NetResponse.ncs_callsign (every active NCS, comma-joined, oldest
 * assignment first; services/ncs_attribution.py). "Name, CALLSIGN" when the
 * name is known: the API sends ncs_name only when there is a single NCS, so
 * with several it is the callsign alone. Blank when the net has no NCS yet,
 * to be written in by hand. Never the net manager.
 */
export const ics205PreparedBy = (ncsCallsign: string | null | undefined, ncsName: string | null | undefined): string => {
  const callsigns = (ncsCallsign || '').split(',').map((c) => c.trim()).filter(Boolean);
  if (callsigns.length === 0) return '';
  const name = callsigns.length === 1 ? (ncsName || '').trim() : '';
  return name && name !== callsigns[0] ? `${name}, ${callsigns[0]}` : callsigns[0];
};

// ---- ICS 205 pages ----

/**
 * Split block 4's rows into pages. Every page carries blocks 1-3, the table
 * heading, block 6 and the footer, so `capacity` is the same on each. Block 5
 * (special instructions) follows the last row, on the last page when it fits
 * and on a page of its own when it doesn't. A row taller than a page still
 * gets one to itself. Returns the row indexes on each page and the page that
 * carries block 5.
 */
export const paginateIcs205 = (
  rowHeights: number[],
  capacity: number,
  instructionsHeight: number,
): { pages: number[][]; instructionsPage: number } => {
  const pages: number[][] = [[]];
  let left = capacity;
  rowHeights.forEach((height, i) => {
    if (height > left && pages[pages.length - 1].length > 0) {
      pages.push([]);
      left = capacity;
    }
    pages[pages.length - 1].push(i);
    left -= height;
  });
  if (instructionsHeight > left && pages[pages.length - 1].length > 0) {
    pages.push([]);
  }
  return { pages, instructionsPage: pages.length - 1 };
};
