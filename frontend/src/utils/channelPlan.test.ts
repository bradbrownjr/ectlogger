import { describe, expect, it } from 'vitest';
import {
  CTCSS_TONES, ChannelPlanEntry, PlanFrequency, ics205PreparedBy, DCS_CODES, buildIcs205Rows, channelName, channelPlanPayload, formatOffset,
  formatTone, frequencyDetails, icsMode, looksLikeRepeater, moveEntry, nacOptions, paginateIcs205,
  radioFieldsFor, radioFieldsPayload, rxFrequency, syncChannelPlan, txFrequency, withFrequencyDetails,
} from './channelPlan';
import { formatFrequencyChip, formatFrequencyList, formatHeaderFrequencyChip } from './frequencyList';

const repeater: PlanFrequency = { id: 1, frequency: '146.940', mode: 'FM', offset: '-0.600', tx_tone: '100.0', bandwidth: 'W' };
const simplex: PlanFrequency = { id: 2, frequency: '146.520', mode: 'FM', description: 'National simplex' };
const dmr: PlanFrequency = { id: 3, mode: 'DMR', network: 'Brandmeister', talkgroup: '3123' };

describe('frequency chip details', () => {
  it('shows the offset with a minus sign, then the tone', () => {
    expect(frequencyDetails(repeater)).toBe('−0.600 PL 100.0 W');
    expect(withFrequencyDetails('146.940', repeater)).toBe('146.940 −0.600 PL 100.0 W');
  });

  it('adds nothing for simplex with no tone', () => {
    expect(frequencyDetails(simplex)).toBe('');
    expect(withFrequencyDetails('146.520', simplex)).toBe('146.520');
    expect(formatOffset('0')).toBe('');
    expect(formatOffset('+0.000')).toBe('');
  });

  it('shows DCS and NAC as stored, and CTCSS as PL', () => {
    expect(formatTone('D023')).toBe('D023');
    expect(formatTone('NAC 293')).toBe('NAC 293');
    expect(formatTone('123.0')).toBe('PL 123.0');
    expect(frequencyDetails({ offset: '+5.000', tx_tone: 'D023' })).toBe('+5.000 D023');
  });

  it('adds the RX tone only when it differs', () => {
    expect(frequencyDetails({ tx_tone: '100.0', rx_tone: '100.0' })).toBe('PL 100.0');
    expect(frequencyDetails({ tx_tone: '100.0', rx_tone: '123.0' })).toBe('PL 100.0 RX PL 123.0');
  });

  it('ends with N or W when set', () => {
    expect(frequencyDetails({ bandwidth: 'N' })).toBe('N');
    expect(frequencyDetails({ offset: '+5.000', bandwidth: 'X' })).toBe('+5.000');
  });

  it('is used by every chip label', () => {
    expect(formatFrequencyChip(repeater)).toBe('146.940 MHz (FM) −0.600 PL 100.0 W');
    expect(formatHeaderFrequencyChip(repeater)).toBe('146.940 MHz FM −0.600 PL 100.0 W');
    expect(formatHeaderFrequencyChip(dmr)).toBe('Brandmeister TG3123 DMR');
    expect(formatFrequencyList([repeater, simplex, dmr])).toBe('146.940 −0.600 PL 100.0 W, 146.520, Brandmeister TG3123');
  });
});

describe('tone choices and fields', () => {
  it('lists the standard tones and codes', () => {
    expect(CTCSS_TONES).toHaveLength(50);
    expect(DCS_CODES).toHaveLength(104);
    expect(DCS_CODES[0]).toBe('D023');
    expect(nacOptions()).toHaveLength(4096);
    expect(nacOptions()).toContain('NAC 293');
  });

  it('offers offset and N/W on a dial frequency, and tones on P25', () => {
    expect(radioFieldsFor('FM')).toEqual({ offset: true, bandwidth: true, tones: true });
    expect(radioFieldsFor('DMR')).toEqual({ offset: false, bandwidth: false, tones: false });
    expect(radioFieldsFor('P25')).toEqual({ offset: false, bandwidth: false, tones: true });
  });

  it('clears fields the mode does not have', () => {
    expect(radioFieldsPayload('DMR', repeater)).toEqual({ offset: null, tx_tone: null, rx_tone: null, bandwidth: null });
    expect(radioFieldsPayload('FM', { offset: ' -0.600 ', tx_tone: '100.0' }))
      .toEqual({ offset: '-0.600', tx_tone: '100.0', rx_tone: null, bandwidth: null });
  });
});

describe('repeater hint', () => {
  it('flags an analog repeater output with no offset or tone', () => {
    expect(looksLikeRepeater({ frequency: '147.090', mode: 'FM' })).toBe(true);
    expect(looksLikeRepeater({ frequency: '444.500', mode: 'FM' })).toBe(true);
    expect(looksLikeRepeater({ frequency: '146.520', mode: 'FM' })).toBe(false);
    expect(looksLikeRepeater({ frequency: '146.520', mode: 'FM', description: 'Club repeater' })).toBe(true);
    expect(looksLikeRepeater({ ...repeater })).toBe(false);
    expect(looksLikeRepeater({ frequency: '147.090', mode: 'DMR' })).toBe(false);
  });
});

describe('plan editing', () => {
  const entry = (id: number, extra: Partial<ChannelPlanEntry> = {}): ChannelPlanEntry => ({
    frequency_id: id, plan_role: null, ics_function: 'tactical', assignment: null, remarks: null, ...extra,
  });

  it('adds a selected frequency to the end and drops an unselected one', () => {
    const plan = [entry(2, { plan_role: 'primary' }), entry(1)];
    expect(syncChannelPlan(plan, [1, 2, 3]).map((e) => e.frequency_id)).toEqual([2, 1, 3]);
    expect(syncChannelPlan(plan, [1, 2, 3])[2].ics_function).toBe('tactical');
    expect(syncChannelPlan(plan, [1]).map((e) => e.frequency_id)).toEqual([1]);
  });

  it('returns the same plan when nothing changed', () => {
    const plan = [entry(1), entry(2)];
    expect(syncChannelPlan(plan, [2, 1])).toBe(plan);
  });

  it('moves an entry and stops at the ends', () => {
    expect(moveEntry([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    const list = [1, 2, 3];
    expect(moveEntry(list, 0, -1)).toBe(list);
    expect(moveEntry(list, 2, 1)).toBe(list);
  });

  it('sends blank text as null', () => {
    expect(channelPlanPayload([entry(1, { assignment: '  ', remarks: ' Talk-in ' })]))
      .toEqual([{ frequency_id: 1, plan_role: null, ics_function: 'tactical', assignment: null, remarks: 'Talk-in' }]);
  });
});

describe('ICS-205 block 4', () => {
  it('derives Mode A or D from the mode', () => {
    for (const m of ['FM', 'AM', 'SSB', 'CW', 'GMRS']) expect(icsMode(m)).toBe('A');
    for (const m of ['DMR', 'D-STAR', 'YSF', 'P25', 'NXDN', 'M17', 'VARA', 'Winlink', 'Packet', 'JS8Call', 'Data']) {
      expect(icsMode(m)).toBe('D');
    }
    expect(icsMode('Other')).toBe('');
  });

  it('prints RX to four decimals with N/W, and TX as frequency plus offset', () => {
    expect(rxFrequency(repeater)).toBe('146.9400 W');
    expect(txFrequency(repeater)).toBe('146.3400 W');
    expect(txFrequency({ frequency: '444.500', mode: 'FM', offset: '+5.000' })).toBe('449.5000');
    expect(rxFrequency(simplex)).toBe('146.5200');
    expect(txFrequency(simplex)).toBe('146.5200');
    expect(rxFrequency(dmr)).toBe('');
  });

  it('names the channel: network and talkgroup first, else the description', () => {
    expect(channelName(simplex)).toBe('National simplex');
    expect(channelName(dmr)).toBe('Brandmeister TG 3123');
    expect(channelName({ mode: 'YSF', network: 'UFB' })).toBe('UFB');
    expect(channelName({ mode: 'DMR', network: 'Brandmeister', talkgroup: '31234', description: 'County talkgroup' }))
      .toBe('Brandmeister TG 31234 (County talkgroup)');
    expect(channelName(repeater)).toBe('146.940 FM');
  });

  it('builds rows in plan order, with the role in the remarks', () => {
    const plan: ChannelPlanEntry[] = [
      { frequency_id: 3, plan_role: 'alternate', ics_function: 'support', assignment: 'Logistics', remarks: 'If the repeater fails' },
      { frequency_id: 1, plan_role: 'primary', ics_function: 'command', assignment: 'Net control', remarks: null },
      { frequency_id: 99, plan_role: null, ics_function: null, assignment: null, remarks: null },
    ];
    const rows = buildIcs205Rows(plan, [repeater, simplex, dmr]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      zone: '', channel: 1, fn: 'Support', name: 'Brandmeister TG 3123', assignment: 'Logistics',
      rxFreq: '', mode: 'D', remarks: 'Alternate; If the repeater fails',
    });
    expect(rows[1]).toMatchObject({
      channel: 2, fn: 'Command', rxFreq: '146.9400 W', rxTone: '', txFreq: '146.3400 W', txTone: '100.0',
      mode: 'A', remarks: 'Primary',
    });
  });
});

describe('ICS-205 block 6', () => {
  it('names the primary NCS, with the name when there is one NCS', () => {
    expect(ics205PreparedBy('W1PINE', 'Alex Reed')).toBe('Alex Reed, W1PINE');
    expect(ics205PreparedBy('W1PINE', null)).toBe('W1PINE');
    expect(ics205PreparedBy('K1COVE, W1PINE', null)).toBe('K1COVE');
  });

  it('is blank when the net has no NCS yet', () => {
    expect(ics205PreparedBy(null, null)).toBe('');
    expect(ics205PreparedBy('', 'Alex Reed')).toBe('');
  });
});

describe('ICS-205 pages', () => {
  it('keeps everything on one page when it fits', () => {
    expect(paginateIcs205([20, 20, 20], 100, 30)).toEqual({ pages: [[0, 1, 2]], instructionsPage: 0 });
  });

  it('runs rows onto later pages', () => {
    expect(paginateIcs205([40, 40, 40], 100, 10)).toEqual({ pages: [[0, 1], [2]], instructionsPage: 1 });
  });

  it('puts special instructions on a page of their own when they do not fit', () => {
    expect(paginateIcs205([40, 40], 100, 30)).toEqual({ pages: [[0, 1], []], instructionsPage: 1 });
  });

  it('gives a row taller than a page a page to itself', () => {
    expect(paginateIcs205([150, 20], 100, 0).pages).toEqual([[0], [1]]);
  });
});
