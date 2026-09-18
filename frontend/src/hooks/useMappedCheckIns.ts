import { useEffect, useState } from 'react';
import { parseLocation, geocodeAddress, ParsedLocation } from '../utils/locationParser';

// ========== useMappedCheckIns ==========
// Turns a net's check-in list into plottable map markers: parse each station's
// location (GPS / Maidenhead / UTM / MGRS handled locally, street addresses
// geocoded through the backend), and report which stations could not be placed.
//
// This is the single implementation for every check-in map in the app - the
// live map (components/CheckInMap.tsx), the net report (pages/NetReport.tsx)
// and the net statistics page (pages/NetStatistics.tsx). Each of those had its
// own copy of this loop until 2026-09-18, and the copies had silently drifted
// into three different behaviors: the report dropped CHECKED_OUT stations from
// the map while the other two kept them (so /nets/95/report plotted 10 of net
// 95's 11 stations while /statistics/nets/95 plotted all 11), and the
// statistics page still carried a 10-address geocode cap that had already been
// found and removed from the other two (an 11th address-only station simply
// vanished, no warning). Both are decided here now, once:
//
//   1. Checked-out stations ARE mapped. They participated in the net; the map
//      is a record of who took part, not of who is still on frequency.
//   2. There is no geocode cap. Nominatim rate limiting is serialized and
//      cached server-side (backend/app/routers/geocode.py), so a net with many
//      unique addresses just takes a few extra seconds the first time.

// The minimal shape this pipeline needs. Every check-in type in the app
// satisfies it structurally, so callers keep their own richer local types.
export interface MappableCheckIn {
  id: number;
  location?: string | null;
  status?: string;
}

export interface MappedCheckIn<T extends MappableCheckIn> {
  checkIn: T;
  parsedLocation: ParsedLocation;
}

export interface UseMappedCheckInsResult<T extends MappableCheckIn> {
  // Stations successfully placed, coordinate-parsed ones first, then geocoded.
  mapped: MappedCheckIn<T>[];
  // Stations that could not be placed: no location on file, an unparseable
  // location, or a geocode that came back empty. Surfaced so a caller can tell
  // the operator why a station is missing instead of silently dropping it.
  unmapped: T[];
  loading: boolean;
}

interface UseMappedCheckInsOptions {
  // Defer all work until the map is actually visible (CheckInMap stays mounted
  // while closed). Defaults to true for the always-rendered page maps.
  enabled?: boolean;
}

export function useMappedCheckIns<T extends MappableCheckIn>(
  checkIns: T[],
  options: UseMappedCheckInsOptions = {}
): UseMappedCheckInsResult<T> {
  const { enabled = true } = options;

  const [mapped, setMapped] = useState<MappedCheckIn<T>[]>([]);
  const [unmapped, setUnmapped] = useState<T[]>([]);
  const [processedKey, setProcessedKey] = useState<string>('');

  // Re-process only when something that affects the map actually changes -
  // which stations, where they are, and what status their marker color
  // reflects. The array identity itself changes on every poll and every
  // WebSocket update, which would otherwise re-geocode the whole net.
  const checkInsKey = checkIns
    .map(c => `${c.id}:${c.location ?? ''}:${c.status ?? ''}`)
    .join('|');

  // Derived rather than its own state: "there is a check-in set we have not
  // processed yet" is exactly what loading means, so the two can never
  // disagree. An empty net (key '') is not loading, it simply has no map.
  const loading = enabled && checkInsKey !== '' && processedKey !== checkInsKey;

  useEffect(() => {
    if (!loading) return;

    // A consumer that unmounts, closes, or moves on to a newer check-in set
    // must not receive a late geocode batch.
    let cancelled = false;

    const processLocations = async () => {
      const results: MappedCheckIn<T>[] = [];
      const failed: T[] = [];
      const addressesToGeocode: { checkIn: T; parsed: ParsedLocation }[] = [];

      // First pass: everything parseable without a network call
      for (const checkIn of checkIns) {
        if (!checkIn.location) {
          failed.push(checkIn);
          continue;
        }

        const parsed = parseLocation(checkIn.location);
        if (!parsed) {
          failed.push(checkIn);
        } else if (parsed.type === 'address') {
          addressesToGeocode.push({ checkIn, parsed });
        } else {
          results.push({ checkIn, parsedLocation: parsed });
        }
      }

      // Second pass: geocode street addresses (no cap - see header comment).
      // A single address that throws must not abandon the rest of the net.
      for (const { checkIn, parsed } of addressesToGeocode) {
        if (cancelled) return;

        try {
          const coords = await geocodeAddress(parsed.original);
          if (coords) {
            results.push({
              checkIn,
              parsedLocation: { ...coords, type: 'address', original: parsed.original },
            });
          } else {
            failed.push(checkIn);
          }
        } catch (error) {
          console.error(`Failed to geocode ${parsed.original}:`, error);
          failed.push(checkIn);
        }
      }

      if (cancelled) return;

      setMapped(results);
      setUnmapped(failed);
      setProcessedKey(checkInsKey);
    };

    processLocations();

    return () => {
      cancelled = true;
    };
    // checkIns is intentionally not a dependency - checkInsKey is its stable
    // content digest, and depending on the array itself would re-run this on
    // every render of the consuming page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, checkInsKey]);

  return { mapped, unmapped, loading };
}
