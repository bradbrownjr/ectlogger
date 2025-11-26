/**
 * Location Parser Utility
 * Parses various location formats and converts them to lat/lon coordinates
 */

export interface ParsedLocation {
  lat: number;
  lon: number;
  type: 'gps' | 'maidenhead' | 'utm' | 'mgrs' | 'address';
  original: string;
}

/**
 * Parse GPS coordinates in various formats
 * Supports: 43.6591, -70.2568 | 43.6591 -70.2568 | 43°39'33"N 70°15'24"W
 */
function parseGPS(location: string): ParsedLocation | null {
  // Decimal degrees: 43.6591, -70.2568 or 43.6591 -70.2568
  const decimalMatch = location.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lon = parseFloat(decimalMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon, type: 'gps', original: location };
    }
  }

  // DMS format: 43°39'33"N 70°15'24"W
  const dmsMatch = location.match(
    /(\d+)°(\d+)'(\d+(?:\.\d+)?)"?([NS])\s*(\d+)°(\d+)'(\d+(?:\.\d+)?)"?([EW])/i
  );
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    let lon = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    if (dmsMatch[8].toUpperCase() === 'W') lon = -lon;
    return { lat, lon, type: 'gps', original: location };
  }

  return null;
}

/**
 * Parse Maidenhead grid square (e.g., FN43mr)
 * Returns center of the grid square
 */
function parseMaidenhead(location: string): ParsedLocation | null {
  const match = location.match(/^([A-R]{2})(\d{2})([A-X]{2})?(\d{2})?$/i);
  if (!match) return null;

  const field1 = match[1].toUpperCase().charCodeAt(0) - 65; // A=0
  const field2 = match[1].toUpperCase().charCodeAt(1) - 65;
  const square1 = parseInt(match[2][0]);
  const square2 = parseInt(match[2][1]);

  let lon = (field1 * 20) - 180 + (square1 * 2) + 1; // Center of 2° square
  let lat = (field2 * 10) - 90 + (square2 * 1) + 0.5; // Center of 1° square

  // Subsquare (if provided)
  if (match[3]) {
    const sub1 = match[3].toUpperCase().charCodeAt(0) - 65;
    const sub2 = match[3].toUpperCase().charCodeAt(1) - 65;
    lon = (field1 * 20) - 180 + (square1 * 2) + (sub1 * 2 / 24) + (1 / 24);
    lat = (field2 * 10) - 90 + (square2 * 1) + (sub2 * 1 / 24) + (0.5 / 24);
  }

  // Extended subsquare (if provided)
  if (match[4]) {
    const ext1 = parseInt(match[4][0]);
    const ext2 = parseInt(match[4][1]);
    lon += (ext1 * 2 / 240) - (1 / 24) + (1 / 240);
    lat += (ext2 * 1 / 240) - (0.5 / 24) + (0.5 / 240);
  }

  return { lat, lon, type: 'maidenhead', original: location };
}

/**
 * Parse UTM coordinates (e.g., 19T 348123 4834567)
 */
function parseUTM(location: string): ParsedLocation | null {
  const match = location.match(/^(\d{1,2})([C-X])\s+(\d+)\s+(\d+)$/i);
  if (!match) return null;

  const zone = parseInt(match[1]);
  const band = match[2].toUpperCase();
  const easting = parseFloat(match[3]);
  const northing = parseFloat(match[4]);

  // Simplified UTM to lat/lon conversion
  // This is an approximation - for precise conversion, a full library would be needed
  const k0 = 0.9996;
  const a = 6378137; // WGS84 semi-major axis
  const e = 0.0818192; // WGS84 eccentricity
  
  const x = easting - 500000;
  const y = band < 'N' ? northing - 10000000 : northing;
  
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  
  const M = y / k0;
  const mu = M / (a * (1 - e * e / 4 - 3 * e * e * e * e / 64));
  
  const lat = mu * 180 / Math.PI;
  const lon = lonOrigin + (x / (a * k0 * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;

  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    return { lat, lon, type: 'utm', original: location };
  }

  return null;
}

/**
 * Parse MGRS coordinates (e.g., 19TCH4812334567)
 */
function parseMGRS(location: string): ParsedLocation | null {
  const match = location.match(/^(\d{1,2})([C-X])([A-Z]{2})(\d+)$/i);
  if (!match) return null;

  const zone = parseInt(match[1]);
  const band = match[2].toUpperCase();
  const gridLetters = match[3].toUpperCase();
  const coords = match[4];

  // Coords should be even length
  if (coords.length % 2 !== 0) return null;

  const precision = coords.length / 2;
  const easting = parseInt(coords.substring(0, precision)) * Math.pow(10, 5 - precision);
  const northing = parseInt(coords.substring(precision)) * Math.pow(10, 5 - precision);

  // Convert grid letters to 100km square
  const col = gridLetters.charCodeAt(0) - 65;
  const row = gridLetters.charCodeAt(1) - 65;

  // This is a simplified conversion - full MGRS requires zone-specific offsets
  const fullEasting = ((col % 8) * 100000) + easting;
  const fullNorthing = ((row % 20) * 100000) + northing;

  // Use UTM conversion with the calculated values
  return parseUTM(`${zone}${band} ${fullEasting + 100000} ${fullNorthing}`);
}

/**
 * Check if a string looks like an address that could be geocoded
 */
function looksLikeAddress(location: string): boolean {
  // Must have at least 2 words
  const words = location.trim().split(/\s+/);
  if (words.length < 2) return false;

  // Common patterns: "City, State" or "Street, City, State"
  if (location.includes(',')) return true;

  // State abbreviations at the end
  const stateAbbrevs = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/i;
  if (stateAbbrevs.test(location)) return true;

  return false;
}

/**
 * Main parsing function - tries all formats
 */
export function parseLocation(location: string): ParsedLocation | null {
  if (!location || location.trim() === '') return null;

  const trimmed = location.trim();

  // Try GPS coordinates first
  const gps = parseGPS(trimmed);
  if (gps) return gps;

  // Try Maidenhead grid square
  const maidenhead = parseMaidenhead(trimmed);
  if (maidenhead) return maidenhead;

  // Try UTM
  const utm = parseUTM(trimmed);
  if (utm) return utm;

  // Try MGRS
  const mgrs = parseMGRS(trimmed);
  if (mgrs) return mgrs;

  // Check if it looks like an address (will need geocoding)
  if (looksLikeAddress(trimmed)) {
    return { lat: 0, lon: 0, type: 'address', original: trimmed };
  }

  return null;
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'ECTLogger/1.0 (Emergency Communications Team Logger)'
        }
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }

  return null;
}
