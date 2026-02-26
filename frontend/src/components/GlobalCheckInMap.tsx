/**
 * GlobalCheckInMap - Geographic distribution of check-ins for the Statistics page.
 *
 * Shows circle markers on a Leaflet map, one per aggregated region
 * (4-char Maidenhead grid square or US state / Canadian province centroid).
 * Marker radius is proportional to the number of check-ins from that region.
 * Individual locations are never revealed — the backend coarsens all data
 * to ≥ 100 km resolution before returning it.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { statisticsApi } from '../services/api';

// ========== Types ==========

interface MapDataPoint {
  region: string;
  latitude: number;
  longitude: number;
  count: number;
}

interface MapResponse {
  regions: MapDataPoint[];
  total_locations: number;
}

// ========== Auto-fit bounds helper ==========

const FitBounds: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.setView(positions[0], 5);
    } else {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 });
    }
  }, [map, positions]);

  return null;
};

// ========== Main Component ==========

const GlobalCheckInMap: React.FC = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch check-in map data on mount
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const response = await statisticsApi.getCheckinMap();
        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load check-in map data');
          console.error('Check-in map fetch error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Tile layer — dark mode uses CartoDB Dark Matter (matches existing CheckInMap)
  const tileUrl = isDarkMode
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = isDarkMode
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  // Compute marker sizes: scale radius between 6 and 30 based on count
  const { positions, maxCount } = useMemo(() => {
    if (!data || data.regions.length === 0) return { positions: [] as [number, number][], maxCount: 1 };
    const max = Math.max(...data.regions.map(r => r.count));
    const pos = data.regions.map(r => [r.latitude, r.longitude] as [number, number]);
    return { positions: pos, maxCount: max };
  }, [data]);

  const getRadius = (count: number): number => {
    if (maxCount <= 1) return 8;
    // Logarithmic scale works better than linear for wide count ranges
    const minR = 6;
    const maxR = 28;
    const logScale = Math.log(count + 1) / Math.log(maxCount + 1);
    return minR + logScale * (maxR - minR);
  };

  // ========== Render ==========

  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 3, mt: 3, textAlign: 'center' }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Loading check-in map…
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Paper>
    );
  }

  if (!data || data.regions.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 3, mt: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No geographic check-in data available yet.
        </Typography>
      </Paper>
    );
  }

  const totalCheckIns = data.regions.reduce((sum, r) => sum + r.count, 0);

  return (
    <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
      {/* ========== Header ========== */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <MapIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
        <Typography variant="h6">
          Check-In Map
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
          {data.regions.length} region{data.regions.length !== 1 ? 's' : ''} · {totalCheckIns.toLocaleString()} check-in{totalCheckIns !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Approximate regions where check-ins have originated. Individual locations are not shown.
      </Typography>

      {/* ========== Map ========== */}
      <Box
        sx={{
          height: { xs: 350, sm: 450, md: 500 },
          borderRadius: 1,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
          // Ensure leaflet controls are visible in dark mode
          '& .leaflet-control-zoom a': {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
          },
        }}
      >
        <MapContainer
          center={[39.8, -98.5]}  // Center of US as default
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer url={tileUrl} attribution={tileAttribution} />
          <FitBounds positions={positions} />

          {data.regions.map((region) => (
            <CircleMarker
              key={region.region}
              center={[region.latitude, region.longitude]}
              radius={getRadius(region.count)}
              pathOptions={{
                fillColor: theme.palette.primary.main,
                fillOpacity: 0.55,
                color: theme.palette.primary.light,
                weight: 1.5,
              }}
            >
              <Popup>
                <strong>{region.region}</strong>
                <br />
                {region.count.toLocaleString()} check-in{region.count !== 1 ? 's' : ''}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </Box>
    </Paper>
  );
};

export default GlobalCheckInMap;
