import L from 'leaflet';

/**
 * The teardrop pin the report and statistics maps draw, in a given color.
 *
 * The SVG is wrapped in an <img> data URI rather than inlined into the
 * divIcon's HTML because both pages capture their map through html2canvas
 * (PDF and PNG export), which renders an <img> reliably and inline SVG
 * unreliably. The live map (CheckInMap.tsx) keeps its own CSS-rotated marker:
 * same palette, different shape, and it is the one surface whose markers are
 * read at a glance during a net rather than in an exported document.
 */
export function createStationMarkerIcon(color: string, width = 24, height = 32): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 32">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
            fill="${color}"
            stroke="#333333"
            stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
    </svg>
  `;

  return L.divIcon({
    className: 'custom-marker',
    html: `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="${width}" height="${height}" style="display: block;" />`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height],
  });
}
