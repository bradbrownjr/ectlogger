import './mapTiles.css';

// See mapTiles.css for why dark-mode check-in maps are plain OSM tiles with
// a CSS filter rather than a separate dark tile server.
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const DARK_TILE_LAYER_CLASS = 'dark-mode-map-tiles';

// `suppressDark` covers PDF/PNG export capture windows, where the darkened
// filter should never appear even in dark mode -- html2canvas bakes in
// whatever's on screen at capture time, and the export always renders on a
// forced-white background.
export function getMapTileClassName(isDarkMode: boolean, suppressDark = false): string | undefined {
  return isDarkMode && !suppressDark ? DARK_TILE_LAYER_CLASS : undefined;
}
