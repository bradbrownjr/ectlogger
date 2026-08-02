import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseLocation, geocodeAddress, ParsedLocation } from '../../utils/locationParser';
import type { CoverageStation } from '../../hooks/useCoverageStations';

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
// stale (muted marker color plus explicit "N days ago" text) rather than
// looking identical to a fresh one. The roadmap's "Last heard" section
// requires this distinction but doesn't specify a number, so 90 days is a
// reasonable default, not a hardcoded product decision.
const STALE_DAYS_THRESHOLD = 90;

const FRESH_COLOR = '#2e7d32'; // green - reconfirmed within the threshold
const STALE_COLOR = '#9e9e9e'; // muted gray - not reconfirmed recently

function createStationIcon(stale: boolean) {
  const color = stale ? STALE_COLOR : FRESH_COLOR;
  return L.divIcon({
    className: 'coverage-marker',
    html: `<div style="
      background-color: ${color};
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
// ago" phrasing always accompanies the marker color, both in the tooltip
// and the popup.
function formatLastHeard(isoDate: string): string {
  const days = daysSince(isoDate);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

interface MappedStation extends CoverageStation {
  parsedLocation: ParsedLocation;
}

interface CoverageMapProps {
  stations: CoverageStation[];
}

const CoverageMap: React.FC<CoverageMapProps> = ({ stations }) => {
  const [mappedStations, setMappedStations] = useState<MappedStation[]>([]);
  const [geocoding, setGeocoding] = useState(true);
  // Keyed off callsign+location so re-geocoding only re-runs when the actual
  // set of stations or their locations changes, not on every parent re-render.
  const stationsKeyRef = useRef<string>('');
  const stationsKey = stations.map((s) => `${s.callsign}:${s.location ?? ''}`).join('|');

  useEffect(() => {
    if (stationsKeyRef.current === stationsKey) return;

    const processLocations = async () => {
      setGeocoding(true);
      const results: MappedStation[] = [];

      for (const station of stations) {
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
  }, [stationsKey, stations]);

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

  return (
    <Box>
      <Box sx={{ height: 420, width: '100%', borderRadius: 1, overflow: 'hidden' }}>
        <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappedStations.map((station) => {
            const stale = daysSince(station.last_heard) > STALE_DAYS_THRESHOLD;
            const lastHeardText = formatLastHeard(station.last_heard);
            return (
              <Marker
                key={station.callsign}
                position={[station.parsedLocation.lat, station.parsedLocation.lon]}
                icon={createStationIcon(stale)}
              >
                {/* Hover on desktop - the one piece of detail the map exists
                    to answer at a glance, per docs/ROADMAP.md Phase 5. */}
                <Tooltip direction="top" offset={[0, -20]}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {station.callsign}
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
                  <Box sx={{ minWidth: 150 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      {station.callsign}
                    </Typography>
                    <Typography variant="body2">
                      Last heard {lastHeardText}
                      {stale ? ' — not reconfirmed recently' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Confirmed on {station.confirmation_count} net{station.confirmation_count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        This map shows only stations you personally reported hearing from a Home operating position — it never includes reports from other participants or nets you did not attend.
      </Typography>
    </Box>
  );
};

export default CoverageMap;
