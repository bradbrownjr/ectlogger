import './mapTiles.css';

// See mapTiles.css for why dark-mode check-in maps are plain OSM tiles with
// a CSS filter rather than a separate dark tile server.
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const DARK_TILE_LAYER_CLASS = 'dark-mode-map-tiles';

// `suppressDark` covers a live capture (CheckInMap's export), where
// html2canvas bakes in whatever's on screen. A copy captured by
// utils/pdfExport.ts needs nothing: it removes the dark class itself.
export function getMapTileClassName(isDarkMode: boolean, suppressDark = false): string | undefined {
  return isDarkMode && !suppressDark ? DARK_TILE_LAYER_CLASS : undefined;
}
