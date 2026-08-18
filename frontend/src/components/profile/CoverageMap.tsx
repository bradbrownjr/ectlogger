import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseLocation, geocodeAddress, ParsedLocation } from '../../utils/locationParser';
import type { CoverageStation } from '../../hooks/useCoverageStations';
import { bandFillFor, bandTierFor, BandTier, BAND_LEGEND, BAND_UNKNOWN_HEX } from '../../utils/bandColors';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

// ========== PERSONAL COVERAGE MAP (Phase 5) ==========
// See docs/ROADMAP.md "Relaying & Propagation Mapping" - the Profile page's
// personal coverage map: stations the current user has confirmed hearing
// from a "Home" operating position, aggregated across all of their own "can
// hear" reports over time (backend/app/routers/users.py
// get_my_can_hear_coverage). This is deliberately a new, lightweight
// component rather than a reuse of CheckInMap.tsx - that component is
// net-scoped and tightly coupled to NetView's docking/pop-out window chrome,
// neither of which applies on the Profile page. It also intentionally plots
// at full precision (NOT the coarsened privacy-aggregation approach in
// statistics_geo.py/GlobalCheckInMap.tsx) - that coarsening exists for
// cross-user privacy on a different (global) feature, and doesn't apply
// here since every station shown was personally reported by the viewer.

// Leaflet's default marker icon path breaks under bundlers unless the image
// URLs are re-pointed explicitly - same fix CheckInMap.tsx applies.
const DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// A confirmation not reconfirmed in this many days is visually flagged as
// stale (reduced marker opacity plus explicit "N days ago" text) rather than
// looking identical to a fresh one. The roadmap's "Last heard" section
// requires this distinction but doesn't specify a number, so 90 days is a
// reasonable default, not a hardcoded product decision.
const STALE_DAYS_THRESHOLD = 90;
const STALE_OPACITY = 0.5;

// Marker fill is now band-derived (see bandColors.ts) rather than a
// fresh/stale color swap - staleness is represented as reduced opacity on
// the same fill instead, so it never collides with the band color channel.
function createStationIcon(tiers: BandTier[], stale: boolean) {
  const color = bandFillFor(tiers);
  return L.divIcon({
    className: 'coverage-marker',
    html: `<div style="
      background-color: ${color};
      opacity: ${stale ? STALE_OPACITY : 1};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

function daysSince(isoDate: string): number {
  const normalized = isoDate.endsWith('Z') ? isoDate : `${isoDate}Z`;
  const then = new Date(normalized).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

// Accessibility: staleness must never be color-only, so the actual "N days
// ago" phrasing always accompanies the marker opacity, both in the tooltip
// and the popup.
function formatLastHeard(isoDate: string): string {
  const days = daysSince(isoDate);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

// One marker per callsign, not per (callsign, band) rollup row - the backend
// groups by band (users.py get_my_can_hear_coverage) so 2m and 40m
// confirmations of the same station are two separate CoverageStation
// entries, but on the map that station is one physical location whose
// marker should show every band it's been heard on, mixed into one color
// (see bandColors.ts). perBand keeps the per-band detail for the popup.
interface GroupedStation {
  callsign: string;
  tiers: BandTier[];
  perBand: CoverageStation[]; // sorted most-recent last_heard first
  lastHeard: string;
  totalConfirmations: number;
  location: string | null;
}

function groupByCallsign(stations: CoverageStation[]): GroupedStation[] {
  const byCallsign = new Map<string, CoverageStation[]>();
  for (const s of stations) {
    const list = byCallsign.get(s.callsign);
    if (list) list.push(s);
    else byCallsign.set(s.callsign, [s]);
  }
  return Array.from(byCallsign.entries()).map(([callsign, entries]) => {
    const perBand = [...entries].sort(
      (a, b) => new Date(b.last_heard).getTime() - new Date(a.last_heard).getTime()
    );
    const mostRecent = perBand[0];
    const tiers = Array.from(
      new Set(entries.map((e) => bandTierFor(e.band)).filter((t): t is BandTier => t !== null))
    );
    return {
      callsign,
      tiers,
      perBand,
      lastHeard: mostRecent.last_heard,
      totalConfirmations: entries.reduce((sum, e) => sum + e.confirmation_count, 0),
      location: mostRecent.location,
    };
  });
}

interface MappedStation extends GroupedStation {
  parsedLocation: ParsedLocation;
}

interface CoverageMapProps {
  stations: CoverageStation[];
}

const CoverageMap: React.FC<CoverageMapProps> = ({ stations }) => {
  const groupedStations = useMemo(() => groupByCallsign(stations), [stations]);

  const [mappedStations, setMappedStations] = useState<MappedStation[]>([]);
  const [geocoding, setGeocoding] = useState(true);
  // Keyed off callsign+location so re-geocoding only re-runs when the actual
  // set of stations or their locations changes, not on every parent re-render.
  const stationsKeyRef = useRef<string>('');
  const stationsKey = groupedStations.map((s) => `${s.callsign}:${s.location ?? ''}`).join('|');

  useEffect(() => {
    if (stationsKeyRef.current === stationsKey) return;

    const processLocations = async () => {
      setGeocoding(true);
      const results: MappedStation[] = [];

      for (const station of groupedStations) {
        if (!station.location) continue; // No location to plot - skip silently

        const parsed = parseLocation(station.location);
        if (!parsed) continue; // Didn't parse - skip silently, same as CheckInMap.tsx

        if (parsed.type === 'address') {
          try {
            const coords = await geocodeAddress(parsed.original);
            if (coords) {
              results.push({ ...station, parsedLocation: { ...parsed, lat: coords.lat, lon: coords.lon } });
            }
            // Geocode failure - skip silently, same as CheckInMap.tsx
          } catch (error) {
            console.error(`Failed to geocode ${parsed.original}:`, error);
          }
        } else {
          results.push({ ...station, parsedLocation: parsed });
        }
      }

      stationsKeyRef.current = stationsKey;
      setMappedStations(results);
      setGeocoding(false);
    };

    processLocations();
  }, [stationsKey, groupedStations]);

  if (geocoding) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <Typography color="text.secondary">Mapping your coverage...</Typography>
      </Box>
    );
  }

  if (mappedStations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        None of your confirmed stations have a mappable location yet.
      </Typography>
    );
  }

  const center: [number, number] = [
    mappedStations[0].parsedLocation.lat,
    mappedStations[0].parsedLocation.lon,
  ];

  // Bands actually present on the map, in legend order - the legend only
  // lists tiers that could actually appear, plus "unknown" only when at
  // least one marker has no determinable band.
  const tiersPresent = new Set(mappedStations.flatMap((s) => s.tiers));
  const hasUnknown = mappedStations.some((s) => s.tiers.length === 0);

  return (
    <Box>
      <Box sx={{ height: 420, width: '100%', borderRadius: 1, overflow: 'hidden' }}>
        <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappedStations.map((station) => {
            const stale = daysSince(station.lastHeard) > STALE_DAYS_THRESHOLD;
            const lastHeardText = formatLastHeard(station.lastHeard);
            const bandList = station.perBand.map((e) => e.band || 'unknown band').join(', ');
            return (
              <Marker
                key={station.callsign}
                position={[station.parsedLocation.lat, station.parsedLocation.lon]}
                icon={createStationIcon(station.tiers, stale)}
              >
                {/* Hover on desktop - the one piece of detail the map exists
                    to answer at a glance, per docs/ROADMAP.md Phase 5. */}
                <Tooltip direction="top" offset={[0, -20]}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {station.callsign}
                    </Typography>
                    <Typography variant="caption" component="div">
                      {bandList}
                    </Typography>
                    <Typography variant="caption" component="div">
                      Last heard {lastHeardText}{stale ? ' (stale)' : ''}
                    </Typography>
                  </Box>
                </Tooltip>
                {/* Tap on mobile - Leaflet's default touch interaction opens
                    a Popup rather than a hover Tooltip, so the same content
                    is duplicated here. */}
                <Popup>
                  <Box sx={{ minWidth: 170 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      {station.callsign}
                    </Typography>
                    <Typography variant="body2">
                      Last heard {lastHeardText}
                      {stale ? ' — not reconfirmed recently' : ''}
                    </Typography>
                    {/* Per-band breakdown - a station heard on both 2m and
                        40m gets one line each, since the two bands are
                        different propagation data points. */}
                    {station.perBand.map((entry) => (
                      <Typography key={entry.band ?? 'unknown'} variant="caption" color="text.secondary" display="block">
                        {entry.band || 'Unknown band'}: confirmed on {entry.confirmation_count} net{entry.confirmation_count !== 1 ? 's' : ''}, last heard {formatLastHeard(entry.last_heard)}
                      </Typography>
                    ))}
                  </Box>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </Box>
      {/* Band color legend - accessibility note: color is reinforced by the
          band label text in every tooltip/popup above, never color-only. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 1 }}>
        {BAND_LEGEND.filter((entry) => tiersPresent.has(entry.tier)).map((entry) => (
          <Box key={entry.tier} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.hex, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{entry.label}</Typography>
          </Box>
        ))}
        {hasUnknown && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: BAND_UNKNOWN_HEX, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">Unknown band</Typography>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary">
          — a station heard on multiple bands blends their colors (e.g. HF + VHF shows as green)
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        This map shows only stations you personally reported hearing from a Home operating position — it never includes reports from other participants or nets you did not attend.
      </Typography>
    </Box>
  );
};

export default CoverageMap;
