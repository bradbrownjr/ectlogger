import React, { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { canHearApi, coverageSiteApi } from '../../services/api';
import { CoverageAccess, CoverageContact, CoverageSite, coverageFrequencies, infrastructureSites, reportingSites, stationSiteName } from '../../utils/coverageSites';

// ========== "WHO CAN THIS STATION HEAR?" COVERAGE REPORTING DIALOG ==========
// Phase 2 of the "can hear" inter-station propagation logging feature (see
// docs/ROADMAP.md "Relaying & Propagation Mapping"). Lets NCS/Logger/Relay
// record which other checked-in stations the reporting station can hear, on
// a given frequency. Saving reconciles the full set for a (reporter,
// frequency) pair server-side (insert new, delete unchecked, touch kept
// edges) - the dialog itself only ever shows current state, never a diff.
//
// Two layouts, chosen by how many frequencies the net has:
//   - 0 or 1 frequency: the original single-list layout below, with a
//     frequency dropdown (only shown when the net has one) that scopes
//     which set of checkboxes is being edited.
//   - 2+ frequencies: a grid (one column per frequency/band) so a combined
//     repeater/simplex or multi-band drill can record who was heard on
//     which frequency in one pass, instead of re-selecting the dropdown and
//     re-checking stations once per frequency. Each column is still its own
//     independent (reporter, frequency) reconciliation server-side - saving
//     the grid just fires one PUT per column instead of one PUT total.
//
// State is intentionally re-derived (not optimistically patched) after a
// save: the parent's canHearReports list refreshes from the can_hear_changed
// WebSocket broadcast, which every viewer (including the saver) receives.

const OPERATING_POSITION_OPTIONS = ['Home', 'Field Deployed'];

// One editable row of "Outside the net" - a station reached that never
// checked in (a neighboring county's EOC). Saved as a whole set per reporting
// check-in, like the checkboxes above (routers/coverage_sites.py).
interface ContactDraft {
  callsign: string;
  station: string;
  county: string;
  state: string;
  frequency_id: number | null;
  two_way: boolean;
}

const toDraft = (c: CoverageContact): ContactDraft => ({
  callsign: c.callsign || '',
  station: c.station || '',
  county: c.county || '',
  state: c.state || '',
  frequency_id: c.frequency_id,
  two_way: c.two_way,
});

// A station's callsign, with its site on the line below when it has one, so
// a long site name wraps under the callsign instead of breaking it apart.
const StationName: React.FC<{ station: any; sitesById: Map<number, CoverageSite> }> = ({ station, sitesById }) => {
  const site = stationSiteName(station, sitesById);
  return (
    <>
      <span>{station.callsign}{station.status === 'checked_out' ? ' (checked out)' : ''}</span>
      {site && <Typography component="span" variant="caption" color="text.secondary" display="block">{site}</Typography>}
    </>
  );
};

type AccessDraft = Record<number, { result: 'reached' | 'failed'; note: string }>;

// This station's saved repeater and node results, keyed by target site.
const accessFor = (existing: CoverageAccess[], checkInId: number): AccessDraft => {
  const drafts: AccessDraft = {};
  existing
    .filter((a) => a.reporter_check_in_id === checkInId)
    .forEach((a) => { drafts[a.target_site_id] = { result: a.reached ? 'reached' : 'failed', note: a.note || '' }; });
  return drafts;
};

interface CanHearDialogProps {
  open: boolean;
  onClose: () => void;
  netId: number;
  net: any;
  reporterCheckIn: any;
  allCheckIns: any[];
  existingReports: any[];
  // The net's coverage sites and its contacts outside the net (useSiteCoverage).
  sites?: CoverageSite[];
  existingContacts?: CoverageContact[];
  existingAccess?: CoverageAccess[];
  onSaved: () => void;
  // Reuses NetView's existing app-wide toast/Snackbar (setToastMessage) for
  // error display, matching the pattern already used across checkInActions.ts.
  onToast: (message: string) => void;
}

// Reports are scoped per (reporter, frequency), so which boxes are pre-checked
// depends on whatever frequency is currently selected in the dialog. Normalize
// null/undefined frequency ids to null so "no frequency" reports match cleanly.
function deriveCheckedIds(reports: any[], reporterCheckInId: number, frequencyId: number | null): Set<number> {
  const normalizedFreq = frequencyId ?? null;
  return new Set(
    reports
      .filter((r: any) => r.reporter_check_in_id === reporterCheckInId && (r.frequency_id ?? null) === normalizedFreq)
      .map((r: any) => r.heard_check_in_id)
  );
}

// Column header for a net frequency in grid mode: "146.520 FM (2m)". `band`
// comes pre-derived from the backend (Frequency.band, see band_utils.py) -
// this never re-derives it client-side.
function frequencyLabel(freq: any): string {
  const base = `${freq.frequency || freq.network || ''} ${freq.mode || ''}`.trim() || freq.description || `Frequency #${freq.id}`;
  return freq.band ? `${base} (${freq.band})` : base;
}

const CanHearDialog: React.FC<CanHearDialogProps> = ({
  open,
  onClose,
  netId,
  net,
  reporterCheckIn,
  allCheckIns,
  existingReports,
  sites: allSites = [],
  existingContacts = [],
  existingAccess = [],
  onSaved,
  onToast,
}) => {
  // Only the frequencies this net collects coverage on: a drill's repeater
  // and DMR talkgroup are excluded by its manager, since everyone hears
  // everyone through them.
  const netFrequencies: any[] = coverageFrequencies(net);
  const sitesById = new Map(allSites.map((site) => [site.id, site]));
  // Places a station can be at, and the repeaters and nodes it tries.
  const sites = reportingSites(allSites);
  const targets = infrastructureSites(allSites);
  // 2+ frequencies switches to the per-frequency grid layout - with 0 or 1
  // there's nothing for columns to distinguish, so the original single list
  // (with its own frequency dropdown for the 1-frequency case) stays simpler.
  const gridMode = netFrequencies.length > 1;

  // Starts on the net's active frequency when that one collects coverage,
  // otherwise on the only coverage frequency if there's just one.
  const initialFrequencyId: number | null =
    netFrequencies.some((f) => f.id === net?.active_frequency_id) ? net.active_frequency_id
      : netFrequencies.length === 1 ? netFrequencies[0].id : null;
  const [selectedFrequencyId, setSelectedFrequencyId] = useState<number | null>(initialFrequencyId);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() =>
    deriveCheckedIds(existingReports, reporterCheckIn.id, initialFrequencyId)
  );
  // Grid mode: one checked-set per net frequency, keyed by frequency_id -
  // each column reconciles independently server-side, so this just mirrors
  // that scoping client-side. Initialized once from existingReports; not
  // re-derived on prop changes since the dialog is remounted (key=checkIn.id
  // in NetView.tsx) whenever a different station's report is opened.
  const [checkedByFrequency, setCheckedByFrequency] = useState<Record<number, Set<number>>>(() => {
    const initial: Record<number, Set<number>> = {};
    netFrequencies.forEach((freq) => {
      initial[freq.id] = deriveCheckedIds(existingReports, reporterCheckIn.id, freq.id);
    });
    return initial;
  });
  // Defaults to "Home" when the station has no operating position recorded
  // yet - most stations reporting on a routine net are home stations, so
  // this saves the common case a click rather than leaving the field blank.
  // On a net with sites, the station's site is offered first and an
  // operator not yet placed starts blank rather than at Home, since most
  // stations on a drill with sites are at one.
  const currentSite = reporterCheckIn.coverage_site_id != null ? sitesById.get(reporterCheckIn.coverage_site_id) : undefined;
  const [operatingPosition, setOperatingPosition] = useState<string>(
    currentSite?.name || reporterCheckIn.operating_position || (sites.length > 0 ? '' : 'Home')
  );
  const positionOptions = [...sites.map((site) => site.name), ...OPERATING_POSITION_OPTIONS];
  const siteForPosition = (text: string) =>
    sites.find((site) => site.name.toLowerCase() === text.trim().toLowerCase());

  const [contacts, setContacts] = useState<ContactDraft[]>(() =>
    existingContacts.filter((c) => c.reporter_check_in_id === reporterCheckIn.id).map(toDraft)
  );
  const [contactsChanged, setContactsChanged] = useState(false);
  // The net's contacts and access results load alongside its sites and can
  // arrive after the dialog opens. Until the user edits a section, follow
  // what's saved, or the section opens empty and Save erases it.
  useEffect(() => {
    if (!contactsChanged) {
      setContacts(existingContacts.filter((c) => c.reporter_check_in_id === reporterCheckIn.id).map(toDraft));
    }
  }, [existingContacts, reporterCheckIn.id, contactsChanged]);
  const updateContact = (index: number, patch: Partial<ContactDraft>) => {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setContactsChanged(true);
  };
  const addContact = () => {
    setContacts((prev) => [...prev, {
      callsign: '', station: '', county: '', state: '',
      frequency_id: netFrequencies.length === 1 ? netFrequencies[0].id : selectedFrequencyId, two_way: true,
    }]);
    setContactsChanged(true);
  };
  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
    setContactsChanged(true);
  };
  // Repeaters and nodes: 'reached', 'failed', or absent for "didn't try".
  const [access, setAccess] = useState<AccessDraft>(() => accessFor(existingAccess, reporterCheckIn.id));
  const [accessChanged, setAccessChanged] = useState(false);
  useEffect(() => {
    if (!accessChanged) setAccess(accessFor(existingAccess, reporterCheckIn.id));
  }, [existingAccess, reporterCheckIn.id, accessChanged]);
  const setAccessResult = (targetId: number, result: '' | 'reached' | 'failed') => {
    setAccess((prev) => {
      const next = { ...prev };
      if (result === '') delete next[targetId];
      else next[targetId] = { result, note: prev[targetId]?.note || '' };
      return next;
    });
    setAccessChanged(true);
  };
  const setAccessNote = (targetId: number, note: string) => {
    setAccess((prev) => (prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], note } } : prev));
    setAccessChanged(true);
  };
  const [saving, setSaving] = useState(false);

  // Changing the frequency re-derives which checkboxes are pre-checked, since
  // reports are scoped per frequency - any in-progress (unsaved) toggles for
  // the previous frequency are discarded, matching "the dialog shows current
  // state" rather than accumulating edits across frequencies. Single-list
  // mode only.
  const handleFrequencyChange = (newFrequencyId: number | null) => {
    setSelectedFrequencyId(newFrequencyId);
    setCheckedIds(deriveCheckedIds(existingReports, reporterCheckIn.id, newFrequencyId));
  };

  const toggleStation = (checkInId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(checkInId)) {
        next.delete(checkInId);
      } else {
        next.add(checkInId);
      }
      return next;
    });
  };

  const toggleGridStation = (frequencyId: number, checkInId: number) => {
    setCheckedByFrequency((prev) => {
      const next = { ...prev, [frequencyId]: new Set(prev[frequencyId] ?? []) };
      const set = next[frequencyId];
      if (set.has(checkInId)) {
        set.delete(checkInId);
      } else {
        set.add(checkInId);
      }
      return next;
    });
  };

  // Every other station in the net, checked-out ones sorted last (not
  // filtered out - a station reported earlier that has since checked out
  // must remain visible, just deprioritized). Array.prototype.sort is a
  // stable sort, so check-in order is otherwise preserved.
  const otherStations = allCheckIns
    .filter((ci: any) => ci.id !== reporterCheckIn.id)
    .slice()
    .sort((a: any, b: any) => {
      const aOut = a.status === 'checked_out' ? 1 : 0;
      const bOut = b.status === 'checked_out' ? 1 : 0;
      return aOut - bOut;
    });

  // ========== SELECT ALL ==========
  // "I heard everybody but WA1XYZ" is a common simplex report (GitHub issue
  // #7), so each checkbox set has a select-all toggle. It deliberately
  // includes checked-out stations: one heard earlier in the net and since
  // checked out was still genuinely heard. Partly checked shows the box as
  // indeterminate; clicking it from either partial or empty selects all.
  const selectAllState = (checked: Set<number> | undefined) => {
    const count = otherStations.filter((s: any) => checked?.has(s.id)).length;
    return {
      all: otherStations.length > 0 && count === otherStations.length,
      some: count > 0 && count < otherStations.length,
    };
  };
  const nextSelection = (checked: Set<number> | undefined) =>
    selectAllState(checked).all ? new Set<number>() : new Set<number>(otherStations.map((s: any) => s.id));

  const toggleAll = () => setCheckedIds((prev) => nextSelection(prev));

  const toggleAllInColumn = (frequencyId: number) => {
    setCheckedByFrequency((prev) => ({ ...prev, [frequencyId]: nextSelection(prev[frequencyId]) }));
  };

  const handleSave = async () => {
    // A row with neither a callsign nor a station name is an empty "Add"
    // nobody filled in: drop it rather than have the save refused.
    const filledContacts = contacts.filter((c) => c.callsign.trim() || c.station.trim());
    const position = operatingPosition.trim() || null;
    const coverageSiteId = position ? siteForPosition(position)?.id ?? null : null;
    setSaving(true);
    try {
      if (gridMode) {
        // Each column is its own (reporter, frequency) scope server-side -
        // save every column so an all-unchecked column still reconciles to
        // "delete everything", not "skip this frequency entirely".
        await Promise.all(
          netFrequencies.map((freq) =>
            canHearApi.save(netId, {
              reporter_check_in_id: reporterCheckIn.id,
              heard_check_in_ids: Array.from(checkedByFrequency[freq.id] ?? []),
              frequency_id: freq.id,
              operating_position: position,
              coverage_site_id: coverageSiteId,
            })
          )
        );
      } else {
        await canHearApi.save(netId, {
          reporter_check_in_id: reporterCheckIn.id,
          heard_check_in_ids: Array.from(checkedIds),
          frequency_id: selectedFrequencyId,
          operating_position: position,
          coverage_site_id: coverageSiteId,
        });
      }
      if (accessChanged) {
        await coverageSiteApi.saveAccess(netId, reporterCheckIn.id, Object.entries(access).map(([targetId, a]) => ({
          target_site_id: Number(targetId),
          reached: a.result === 'reached',
          note: a.note.trim() || null,
        })));
      }
      if (contactsChanged) {
        await coverageSiteApi.saveContacts(netId, reporterCheckIn.id, filledContacts.map((c) => ({
          callsign: c.callsign.trim() || null,
          station: c.station.trim() || null,
          county: c.county.trim() || null,
          state: c.state.trim() || null,
          frequency_id: c.frequency_id,
          two_way: c.two_way,
        })));
      }
      onSaved();
    } catch (error: any) {
      // 403 (toggle off / role lost), 400 (self-edge / cross-net), and 409
      // (concurrent save) all carry a human-readable detail from the API -
      // show it and leave the dialog open so the user can retry. In grid
      // mode a column that already saved before a later one failed stays
      // saved server-side; re-clicking Save just resends every column,
      // which is a harmless reconfirmation for the ones that succeeded.
      const detail = error?.response?.data?.detail;
      onToast(typeof detail === 'string' ? detail : 'Failed to save coverage report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth={gridMode ? 'md' : 'sm'} fullWidth PaperProps={{ sx: { m: { xs: 1, sm: 4 } } }}>
      <DialogTitle>Who can {reporterCheckIn.callsign} hear?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {gridMode
            ? `Check every station ${reporterCheckIn.callsign} can hear, on every frequency it hears them on. Saving replaces the current report for each frequency.`
            : `Check every station ${reporterCheckIn.callsign} can hear on the selected frequency. Saving replaces the current report for this station and frequency.`}
        </Typography>

        {/* Frequency selector - single-list mode only. Reports are scoped
            per frequency, so a combined repeater/simplex drill can tell them
            apart. Defaults to the net's active frequency. Grid mode below
            replaces this with one column per frequency instead. */}
        {!gridMode && netFrequencies.length > 0 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="can-hear-frequency-label">Frequency</InputLabel>
            <Select
              labelId="can-hear-frequency-label"
              label="Frequency"
              value={selectedFrequencyId ?? ''}
              onChange={(e) => handleFrequencyChange(e.target.value === '' ? null : Number(e.target.value))}
            >
              <MenuItem value="">
                <em>No specific frequency</em>
              </MenuItem>
              {netFrequencies.map((freq: any) => (
                <MenuItem key={freq.id} value={freq.id}>
                  {frequencyLabel(freq)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {otherStations.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No other stations are checked in yet.
          </Typography>
        ) : gridMode ? (
          /* One column per net frequency/band - a multi-band net records who
             was heard on which frequency in one pass instead of re-selecting
             the dropdown per frequency. */
          <TableContainer sx={{ mb: 2, maxHeight: 360, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Station</TableCell>
                  {netFrequencies.map((freq) => (
                    <TableCell key={freq.id} align="center" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {frequencyLabel(freq)}
                      {/* Select-all for this frequency's column only */}
                      <Box>
                        <Checkbox
                          checked={selectAllState(checkedByFrequency[freq.id]).all}
                          indeterminate={selectAllState(checkedByFrequency[freq.id]).some}
                          onChange={() => toggleAllInColumn(freq.id)}
                          inputProps={{ 'aria-label': `All stations on ${frequencyLabel(freq)}` }}
                        />
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {otherStations.map((station: any) => (
                  <TableRow key={station.id} sx={{ opacity: station.status === 'checked_out' ? 0.6 : 1 }}>
                    <TableCell>
                      <StationName station={station} sitesById={sitesById} />
                    </TableCell>
                    {netFrequencies.map((freq) => (
                      <TableCell key={freq.id} align="center" sx={{ p: 0 }}>
                        <Checkbox
                          checked={checkedByFrequency[freq.id]?.has(station.id) ?? false}
                          onChange={() => toggleGridStation(freq.id, station.id)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          /* Responsive 2-3 column checkbox grid - a 25-station net fits without scrolling */
          <>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectAllState(checkedIds).all}
                indeterminate={selectAllState(checkedIds).some}
                onChange={toggleAll}
              />
            }
            label="All stations"
            sx={{ mb: 1, '& .MuiFormControlLabel-label': { fontWeight: 'medium' } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, mb: 2 }}>
            {otherStations.map((station: any) => (
              <FormControlLabel
                key={station.id}
                control={
                  <Checkbox
                    checked={checkedIds.has(station.id)}
                    onChange={() => toggleStation(station.id)}
                  />
                }
                label={<StationName station={station} sitesById={sitesById} />}
                sx={{ opacity: station.status === 'checked_out' ? 0.6 : 1 }}
              />
            ))}
          </Box>
          </>
        )}

        {/* Operating position describes the reporting station, not the pair -
            see docs/ROADMAP.md "Operating position" for why it lives here. */}
        {/* On a net with sites, picking one puts this check-in at that site
            (CheckIn.coverage_site_id), which is what Coverage by site groups
            on. Typed text that isn't a site name is an ordinary position. */}
        <Autocomplete
          freeSolo
          options={positionOptions}
          groupBy={sites.length > 0 ? (option) => (siteForPosition(option) ? 'Sites' : 'Other') : undefined}
          value={operatingPosition}
          onChange={(_, newValue) => setOperatingPosition(newValue || '')}
          onInputChange={(_, newInputValue) => setOperatingPosition(newInputValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Operating Position"
              margin="normal"
              placeholder={sites.length > 0 ? 'Pick a site, or Home, or type your own' : 'Home, Field Deployed, or type your own'}
              helperText={sites.length > 0
                ? `Where ${reporterCheckIn.callsign} is operating from on this net`
                : `Describes ${reporterCheckIn.callsign}'s setup, not this report`}
            />
          )}
        />

        {/* ========== REPEATERS AND NODES ========== */}
        {/* Whether this station got into each of the net's repeaters, packet
            nodes and gateways. Unlike the checkboxes above, "couldn't reach"
            is recorded: it's a finding. Blank = didn't try. */}
        {targets.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Repeaters and nodes</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Could {reporterCheckIn.callsign} get into each one? Leave it at Didn't try if they didn't.
            </Typography>
            {targets.map((target) => {
              const entry = access[target.id];
              return (
                <Box
                  key={target.id}
                  sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr 1.6fr' }, gap: 1, alignItems: 'center', mb: 1 }}
                >
                  <Typography variant="body2" fontWeight="medium">{target.name}</Typography>
                  <FormControl size="small">
                    <Select
                      value={entry?.result || ''}
                      displayEmpty
                      onChange={(e) => setAccessResult(target.id, e.target.value as '' | 'reached' | 'failed')}
                      inputProps={{ 'aria-label': `Result for ${target.name}` }}
                    >
                      <MenuItem value=""><em>Didn't try</em></MenuItem>
                      <MenuItem value="reached">Reached</MenuItem>
                      <MenuItem value="failed">Couldn't reach</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    placeholder="Note (optional)"
                    value={entry?.note || ''}
                    disabled={!entry}
                    onChange={(e) => setAccessNote(target.id, e.target.value)}
                    inputProps={{ maxLength: 500, 'aria-label': `Note for ${target.name}` }}
                  />
                </Box>
              );
            })}
          </Box>
        )}

        {/* ========== OUTSIDE THE NET ========== */}
        {/* Stations reached that never checked in, such as a neighboring
            county's EOC. They feed the Counties reached list. */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Outside the net</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Stations {reporterCheckIn.callsign} reached that aren't checked in, such as another county's EOC.
          </Typography>
          {contacts.map((contact, index) => (
            <Box
              key={index}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1.4fr 1fr 0.6fr' },
                gap: 1,
                alignItems: 'center',
                mb: 1.5,
                pb: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <TextField size="small" label="Callsign" value={contact.callsign}
                onChange={(e) => updateContact(index, { callsign: e.target.value.toUpperCase() })} />
              <TextField size="small" label="Station or agency" value={contact.station}
                onChange={(e) => updateContact(index, { station: e.target.value })} />
              <TextField size="small" label="County" value={contact.county}
                onChange={(e) => updateContact(index, { county: e.target.value })} />
              <TextField size="small" label="State" value={contact.state}
                onChange={(e) => updateContact(index, { state: e.target.value.toUpperCase() })} />
              {netFrequencies.length > 0 && (
                <FormControl size="small" sx={{ gridColumn: { xs: '1 / -1', sm: 'span 2' } }}>
                  <InputLabel id={`contact-frequency-${index}`}>Frequency</InputLabel>
                  <Select
                    labelId={`contact-frequency-${index}`}
                    label="Frequency"
                    value={contact.frequency_id ?? ''}
                    onChange={(e) => updateContact(index, { frequency_id: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <MenuItem value=""><em>No specific frequency</em></MenuItem>
                    {netFrequencies.map((freq: any) => (
                      <MenuItem key={freq.id} value={freq.id}>{frequencyLabel(freq)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl size="small">
                <InputLabel id={`contact-direction-${index}`}>Direction</InputLabel>
                <Select
                  labelId={`contact-direction-${index}`}
                  label="Direction"
                  value={contact.two_way ? 'two_way' : 'heard'}
                  onChange={(e) => updateContact(index, { two_way: e.target.value === 'two_way' })}
                >
                  <MenuItem value="two_way">Two-way</MenuItem>
                  <MenuItem value="heard">Heard only</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ justifySelf: 'end' }}>
                <IconButton aria-label="Remove this contact" onClick={() => removeContact(index)}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Box>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={addContact}>Add contact</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CanHearDialog;
