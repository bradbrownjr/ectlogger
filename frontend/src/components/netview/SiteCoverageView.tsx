import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { COVERAGE_ONE_WAY_COLOR, COVERAGE_TWO_WAY_COLOR, FitBounds } from '../CheckInMap';
import { useMappedCheckIns } from '../../hooks/useMappedCheckIns';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL, getMapTileClassName } from '../../utils/mapTiles';
import { frozenTableProps, frozenTableSx } from '../../utils/frozenTable';
import {
  REACH_STATUS_LABELS,
  ReachStatus,
  SITE_TYPE_LABELS,
  SiteCoverageNode,
  SiteCoverageSummary,
  siteMapLocation,
} from '../../utils/coverageSites';

// ========== COVERAGE BY SITE ==========
// The place-to-place view of a net's coverage, for drills such as an ARES
// SET where teams go to shelters and the EMA offices and the question is
// where, not who. Renders the backend's rollup
// (services/site_coverage.py, GET /nets/{id}/site-coverage) and never
// computes coverage itself, so the panel, the report and the closing email
// can't disagree. Presentational only, like CoverageReport: used in the
// Coverage panel, its pop-out window, and the net report.
//
// Sections, each shown only when it has something in it:
//   Reaching the primary sites  every site against each starred site
//   Between sites               a grid of which frequencies worked
//   Repeaters and nodes         which sites got in, which couldn't, and why
//   Map                         sites, repeaters and nodes, with a line for each path
//   Counties reached            from contacts outside the net
//   Contacts outside the net

interface SiteCoverageViewProps {
  summary: SiteCoverageSummary;
  frequencyLabels: Record<number, string>;
  // Report PDF/PNG export: light map tiles, no interactive frequency filter.
  exporting?: boolean;
  showMap?: boolean;
  // In the Coverage panel: each table keeps its heading row and first column
  // in view while it scrolls (utils/frozenTable.ts). Not in the net report,
  // which is a page, not a scrolling panel.
  frozen?: boolean;
}

const ACCESS_REACHED_COLOR = '#2e7d32';
const ACCESS_FAILED_COLOR = '#d32f2f';

const STATUS_CHIP: Record<ReachStatus, { color: 'success' | 'info' | 'default' | 'error' }> = {
  two_way: { color: 'success' },
  relay: { color: 'info' },
  one_way: { color: 'default' },
  none: { color: 'error' },
};

export function frequencyText(fid: number | null, frequencyLabels: Record<number, string>): string {
  return fid == null ? 'No specific frequency' : frequencyLabels[fid] || `Frequency #${fid}`;
}

// The CSV the Coverage panel's export button downloads in the by-site view:
// one block per section, the same rows the screen shows.
export function siteCoverageCsv(summary: SiteCoverageSummary, frequencyLabels: Record<number, string>): string {
  const names = new Map(summary.nodes.map((n) => [n.key, n.name]));
  const freqs = (ids: (number | null)[]) => ids.map((f) => frequencyText(f, frequencyLabels)).join('; ');
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const row = (...cells: string[]) => lines.push(cells.map(escape).join(','));

  row('Reaching the primary sites');
  row('Site', 'Primary site', 'Result', 'Two-way on', 'One-way on', 'Relay through');
  summary.reach.forEach((r) => r.targets.forEach((t) => row(
    names.get(r.site_key) || '', names.get(t.primary_key) || '', REACH_STATUS_LABELS[t.status],
    freqs(t.two_way_frequency_ids), freqs(t.one_way_frequency_ids), t.relay_keys.map((k) => names.get(k) || '').join('; '),
  )));
  lines.push('');
  row('Between sites');
  row('Heard by', 'Heard', 'Frequency', 'Link type');
  summary.links.forEach((l) => row(
    names.get(l.from_key) || '', names.get(l.to_key) || '', frequencyText(l.frequency_id, frequencyLabels), l.two_way ? 'Two-way' : 'One-way',
  ));
  lines.push('');
  row('Repeaters and nodes');
  row('From', 'Repeater or node', 'Result', 'Notes');
  const targetNames = new Map(summary.targets.map((t) => [t.site_id, t.name]));
  summary.access.forEach((a) => row(
    names.get(a.node_key) || '', targetNames.get(a.target_site_id) || '', a.reached ? 'Reached' : "Couldn't reach",
    a.attempts.filter((t) => t.note).map((t) => `${t.callsign}: ${t.note}`).join('; '),
  ));
  lines.push('');
  row('Contacts outside the net');
  row('From', 'Operator', 'Callsign', 'Station', 'County', 'State', 'Frequency', 'Direction');
  summary.contacts.forEach((c) => row(
    names.get(c.from_key) || '', c.reporter_callsign, c.callsign || '', c.station || '', c.county || '', c.state || '',
    frequencyText(c.frequency_id, frequencyLabels), c.two_way ? 'Two-way' : 'Heard only',
  ));
  return lines.join('\n');
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>{children}</Typography>
);

const NodeName: React.FC<{ node: SiteCoverageNode | undefined }> = ({ node }) => {
  if (!node) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {node.is_primary && <StarIcon sx={{ fontSize: 14, color: 'warning.main' }} titleAccess="Primary site" />}
      <Typography variant="body2" fontWeight="medium" component="span">{node.name}</Typography>
    </Box>
  );
};

const SiteCoverageView: React.FC<SiteCoverageViewProps> = ({ summary, frequencyLabels, exporting = false, showMap = true, frozen = false }) => {
  const theme = useTheme();
  const tableBox = frozen ? { sx: frozenTableSx(theme), ...frozenTableProps } : { sx: { overflowX: 'auto' } };
  const nodesByKey = useMemo(() => new Map(summary.nodes.map((n) => [n.key, n])), [summary.nodes]);
  const siteNodes = summary.nodes.filter((n) => n.kind === 'site');
  const primaries = siteNodes.filter((n) => n.is_primary);
  const [mapFrequency, setMapFrequency] = useState<'all' | number>('all');

  // ---- Grid cells: the frequencies the row heard the column on ----
  const heardOn = useMemo(() => {
    const cells = new Map<string, { fid: number | null; twoWay: boolean }[]>();
    summary.links.forEach((l) => {
      const key = `${l.from_key}|${l.to_key}`;
      cells.set(key, [...(cells.get(key) || []), { fid: l.frequency_id, twoWay: l.two_way }]);
    });
    return cells;
  }, [summary.links]);
  // Grid rows/columns: every site, plus any other station that heard or was
  // heard by someone, since a home station between two shelters is a relay.
  const gridNodes = summary.nodes.filter(
    (n) => n.kind === 'site' || summary.links.some((l) => l.from_key === n.key || l.to_key === n.key)
  );

  // ---- Map: sites placed through the same pipeline as check-ins ----
  const mappableSites = useMemo(
    () => siteNodes.map((n, i) => ({ id: n.site_id ?? -i - 1, key: n.key, name: n.name, location: siteMapLocation(n) })),
    [siteNodes]
  );
  const { mapped, loading: sitesLoading } = useMappedCheckIns(mappableSites, { enabled: showMap && siteNodes.length > 0 });
  const positionByKey = new Map(mapped.map((m) => [m.checkIn.key, [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number]]));
  // One line per pair: solid amber where any frequency in the filter worked
  // both ways, dashed grey where it's only been heard one way.
  const mapLines = useMemo(() => {
    const pairs = new Map<string, { a: string; b: string; twoWay: boolean }>();
    summary.links.forEach((l) => {
      if (mapFrequency !== 'all' && l.frequency_id !== mapFrequency) return;
      const [a, b] = [l.from_key, l.to_key].sort();
      const key = `${a}|${b}`;
      const prev = pairs.get(key);
      pairs.set(key, { a, b, twoWay: (prev?.twoWay || false) || l.two_way });
    });
    return Array.from(pairs.values()).filter((p) => positionByKey.has(p.a) && positionByKey.has(p.b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.links, mapFrequency, mapped]);
  const linkFrequencies = Array.from(new Set(summary.links.map((l) => l.frequency_id))).filter((f): f is number => f != null);

  // ---- Repeaters and nodes ----
  const accessByCell = new Map(summary.access.map((a) => [`${a.node_key}|${a.target_site_id}`, a]));
  const accessNodes = summary.nodes.filter((n) => summary.access.some((a) => a.node_key === n.key) || n.kind === 'site');
  const mappableTargets = useMemo(
    () => summary.targets.map((t) => ({ id: t.site_id, key: `target:${t.site_id}`, name: t.name, location: siteMapLocation(t) })),
    [summary.targets]
  );
  const { mapped: mappedTargets, loading: targetsLoading } = useMappedCheckIns(mappableTargets, { enabled: showMap && summary.targets.length > 0 });
  // FitBounds fits once, on the first positions it sees, so the map waits
  // until every site has been placed or it zooms onto whichever came first.
  const placing = sitesLoading || targetsLoading;
  const targetPositions = new Map(mappedTargets.map((m) => [m.checkIn.id, [m.parsedLocation.lat, m.parsedLocation.lon] as [number, number]]));
  const accessLines = summary.access.filter((a) => positionByKey.has(a.node_key) && targetPositions.has(a.target_site_id));
  const allPositions = [...Array.from(positionByKey.values()), ...Array.from(targetPositions.values())];

  if (siteNodes.length === 0 && summary.contacts.length === 0 && summary.targets.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        This net has no sites and no contacts outside the net yet. Its manager adds sites in the net's settings, under coverage logging.
      </Typography>
    );
  }

  const headCell = { fontWeight: 'bold', whiteSpace: 'nowrap' } as const;

  return (
    <Box>
      {/* ========== REACHING THE PRIMARY SITES ========== */}
      {primaries.length > 0 && (
        <>
          <SectionTitle>Reaching the primary sites</SectionTitle>
          <TableContainer component={Paper} variant="outlined" {...tableBox}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={headCell}>Site</TableCell>
                  {primaries.map((p) => (
                    <TableCell key={p.key} sx={headCell}><NodeName node={p} /></TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.reach.map((row) => (
                  <TableRow key={row.site_key}>
                    <TableCell><NodeName node={nodesByKey.get(row.site_key)} /></TableCell>
                    {primaries.map((p) => {
                      const target = row.targets.find((t) => t.primary_key === p.key);
                      if (!target) return <TableCell key={p.key} sx={{ color: 'text.disabled' }}>—</TableCell>;
                      const detail = target.status === 'two_way'
                        ? target.two_way_frequency_ids.map((f) => frequencyText(f, frequencyLabels)).join(', ')
                        : target.status === 'relay'
                          ? `Via ${target.relay_keys.map((k) => nodesByKey.get(k)?.name || k).join(' or ')}`
                          : target.status === 'one_way'
                            ? target.one_way_frequency_ids.map((f) => frequencyText(f, frequencyLabels)).join(', ')
                            : '';
                      return (
                        <TableCell key={p.key}>
                          <Chip size="small" variant="outlined" color={STATUS_CHIP[target.status].color} label={REACH_STATUS_LABELS[target.status]} />
                          {detail && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              {detail}
                            </Typography>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ========== BETWEEN SITES (GRID) ========== */}
      {gridNodes.length > 1 && (
        <>
          <SectionTitle>Between sites</SectionTitle>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Each square lists the frequencies the row heard the column on. ⇄ means they heard each other.
          </Typography>
          <TableContainer component={Paper} variant="outlined" {...tableBox}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={headCell}>Heard by ↓</TableCell>
                  {gridNodes.map((n) => (
                    <TableCell key={n.key} sx={headCell}><NodeName node={n} /></TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {gridNodes.map((rowNode) => (
                  <TableRow key={rowNode.key}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <NodeName node={rowNode} />
                      {rowNode.callsigns.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {rowNode.kind === 'site' ? rowNode.callsigns.join(', ') : 'No site'}
                        </Typography>
                      )}
                    </TableCell>
                    {gridNodes.map((colNode) => {
                      if (colNode.key === rowNode.key) {
                        return <TableCell key={colNode.key} sx={{ backgroundColor: theme.palette.action.disabledBackground }} />;
                      }
                      const cell = heardOn.get(`${rowNode.key}|${colNode.key}`) || [];
                      return (
                        <TableCell key={colNode.key} sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                          {cell.length === 0 ? (
                            <Typography variant="caption" color="text.disabled">—</Typography>
                          ) : cell.map((c) => (
                            <Box key={String(c.fid)} sx={{ color: c.twoWay ? 'success.main' : 'text.primary' }}>
                              {frequencyText(c.fid, frequencyLabels)}{c.twoWay ? ' ⇄' : ''}
                            </Box>
                          ))}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ========== REPEATERS AND NODES ========== */}
      {summary.targets.length > 0 && (
        <>
          <SectionTitle>Repeaters and nodes</SectionTitle>
          <TableContainer component={Paper} variant="outlined" {...tableBox}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={headCell}>From</TableCell>
                  {summary.targets.map((t) => (
                    <TableCell key={t.site_id} sx={headCell}>
                      {t.name}
                      {t.frequency_id != null && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {frequencyText(t.frequency_id, frequencyLabels)}
                        </Typography>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {accessNodes.map((node) => (
                  <TableRow key={node.key}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}><NodeName node={node} /></TableCell>
                    {summary.targets.map((t) => {
                      const cell = accessByCell.get(`${node.key}|${t.site_id}`);
                      if (!cell) {
                        return (
                          <TableCell key={t.site_id}>
                            <Typography variant="caption" color="text.disabled">Not tried</Typography>
                          </TableCell>
                        );
                      }
                      const notes = cell.attempts.filter((a) => a.note);
                      return (
                        <TableCell key={t.site_id}>
                          <Chip size="small" variant="outlined" color={cell.reached ? 'success' : 'error'}
                            label={cell.reached ? 'Reached' : "Couldn't reach"} />
                          {notes.map((a, i) => (
                            <Typography key={i} variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              {a.callsign}: {a.note}
                            </Typography>
                          ))}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ========== MAP OF SITES ========== */}
      {showMap && !placing && (mapped.length > 0 || mappedTargets.length > 0) && (
        <>
          {/* Heading and map never cut across two PDF pages (the Coverage
              panel's export) */}
          <Box data-pdf-avoid-break>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <SectionTitle>Map</SectionTitle>
            {!exporting && linkFrequencies.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 180 }} data-export-hide>
                <Select
                  value={mapFrequency === 'all' ? 'all' : String(mapFrequency)}
                  onChange={(e) => setMapFrequency(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  inputProps={{ 'aria-label': 'Frequency shown on the map' }}
                >
                  <MenuItem value="all">All frequencies</MenuItem>
                  {linkFrequencies.map((f) => (
                    <MenuItem key={f} value={String(f)}>{frequencyText(f, frequencyLabels)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
          <Box sx={{ height: 320, width: '100%', borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
            <MapContainer center={allPositions[0]} zoom={9} style={{ height: '100%', width: '100%' }}>
              <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} className={getMapTileClassName(theme.palette.mode === 'dark', exporting)} />
              <FitBounds positions={allPositions} />
              {/* Site to repeater/node: green where someone got in, red dashed where they couldn't */}
              {accessLines.map((a) => (
                <Polyline
                  key={`${a.node_key}|target:${a.target_site_id}`}
                  positions={[positionByKey.get(a.node_key)!, targetPositions.get(a.target_site_id)!]}
                  pathOptions={a.reached
                    ? { color: ACCESS_REACHED_COLOR, weight: 2, opacity: 0.8 }
                    : { color: ACCESS_FAILED_COLOR, weight: 2, opacity: 0.8, dashArray: '2 6' }}
                />
              ))}
              {mapLines.map((line) => (
                <Polyline
                  key={`${line.a}|${line.b}`}
                  positions={[positionByKey.get(line.a)!, positionByKey.get(line.b)!]}
                  pathOptions={line.twoWay
                    ? { color: COVERAGE_TWO_WAY_COLOR, weight: 3, opacity: 0.85 }
                    : { color: COVERAGE_ONE_WAY_COLOR, weight: 2, opacity: 0.75, dashArray: '6 6' }}
                />
              ))}
              {[...mapped, ...mappedTargets].map((m) => (
                <Marker key={m.checkIn.key} position={[m.parsedLocation.lat, m.parsedLocation.lon]}>
                  <LeafletTooltip direction="top" offset={[0, -20]} permanent={exporting}>
                    {m.checkIn.name}
                  </LeafletTooltip>
                </Marker>
              ))}
            </MapContainer>
          </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Solid amber: heard each other. Dashed grey: heard one way.
            {summary.access.length > 0 ? ' Green: got into the repeater or node. Red dotted: couldn’t.' : ''}
          </Typography>
          {mapped.length < siteNodes.length && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {siteNodes.length - mapped.length} site{siteNodes.length - mapped.length === 1 ? '' : 's'} not on the map: no place the map can find.
            </Typography>
          )}
        </>
      )}

      {/* ========== COUNTIES REACHED ========== */}
      {summary.counties.length > 0 && (
        <>
          <SectionTitle>Counties reached</SectionTitle>
          <TableContainer component={Paper} variant="outlined" {...tableBox}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={headCell}>County</TableCell>
                  <TableCell sx={headCell}>Reached from</TableCell>
                  <TableCell sx={headCell}>Frequency</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.counties.map((c) => (
                  <TableRow key={`${c.county}|${c.state}`}>
                    <TableCell>{[c.county, c.state].filter(Boolean).join(', ')}</TableCell>
                    <TableCell>{c.from_keys.map((k) => nodesByKey.get(k)?.name || k).join(', ')}</TableCell>
                    <TableCell>{c.frequency_ids.map((f) => frequencyText(f, frequencyLabels)).join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* ========== CONTACTS OUTSIDE THE NET ========== */}
      {summary.contacts.length > 0 && (
        <>
          <SectionTitle>Contacts outside the net</SectionTitle>
          <TableContainer component={Paper} variant="outlined" {...tableBox}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                  <TableCell sx={headCell}>From</TableCell>
                  <TableCell sx={headCell}>Station</TableCell>
                  <TableCell sx={headCell}>County</TableCell>
                  <TableCell sx={headCell}>Frequency</TableCell>
                  <TableCell sx={headCell}>Direction</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.contacts.map((c) => {
                  const from = nodesByKey.get(c.from_key);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <NodeName node={from} />
                        {from?.kind === 'site' && (
                          <Typography variant="caption" color="text.secondary" display="block">{c.reporter_callsign}</Typography>
                        )}
                      </TableCell>
                      <TableCell>{[c.callsign, c.station].filter(Boolean).join(' ')}</TableCell>
                      <TableCell>{[c.county, c.state].filter(Boolean).join(', ') || '—'}</TableCell>
                      <TableCell>{frequencyText(c.frequency_id, frequencyLabels)}</TableCell>
                      <TableCell>{c.two_way ? 'Two-way' : 'Heard only'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Site legend: what the star and the types mean */}
      {siteNodes.length > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          {siteNodes.map((n) => `${n.name} (${n.site_type ? SITE_TYPE_LABELS[n.site_type] : 'Site'})`).join(' · ')}
          {primaries.length > 0 ? '. ★ marks a primary site, which every other site is checked against.' : ''}
        </Typography>
      )}
    </Box>
  );
};

export default SiteCoverageView;
