import React, { useEffect, useState, useRef } from 'react';
import {
  Paper,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import { Rnd } from 'react-rnd';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseLocation, geocodeAddress, ParsedLocation } from '../utils/locationParser';

// Fix for default marker icons in webpack/vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom marker colors based on status
const createColoredIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
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
};

interface CheckIn {
  id: number;
  callsign: string;
  name?: string;
  location?: string;
  status: string;
  user_id?: number;
}

interface CheckInMapProps {
  open: boolean;
  onClose: () => void;
  checkIns: CheckIn[];
  netName: string;
  ncsUserIds?: number[]; // User IDs of NCS operators
}

interface MappedCheckIn extends CheckIn {
  parsedLocation: ParsedLocation;
}

// Component to fit map bounds to markers
const FitBounds: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [map, positions]);

  return null;
};

const CheckInMap: React.FC<CheckInMapProps> = ({ open, onClose, checkIns, netName, ncsUserIds = [] }) => {
  const [mappedCheckIns, setMappedCheckIns] = useState<MappedCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const mapRef = useRef<L.Map | null>(null);

  // Window position and size state - responsive for mobile
  const isMobile = window.innerWidth < 768;
  const [windowState, setWindowState] = useState(() => {
    if (isMobile) {
      // On mobile, use almost full screen with some padding
      return {
        x: 10,
        y: 60,
        width: Math.min(window.innerWidth - 20, 700),
        height: Math.min(window.innerHeight - 120, 500),
      };
    }
    return {
      x: Math.max(20, window.innerWidth - 720),
      y: 100,
      width: 700,
      height: 500,
    };
  });

  // Keep window within viewport bounds on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowState(prev => ({
        ...prev,
        x: Math.max(0, Math.min(prev.x, window.innerWidth - 100)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - 50)),
        width: Math.min(prev.width, window.innerWidth - 20),
        height: Math.min(prev.height, window.innerHeight - 100),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (!open) return;

    const processLocations = async () => {
      setLoading(true);
      const results: MappedCheckIn[] = [];
      const addressesToGeocode: { checkIn: CheckIn; parsed: ParsedLocation }[] = [];

      // First pass: parse all locations
      for (const checkIn of checkIns) {
        if (!checkIn.location || checkIn.status === 'checked_out') continue;

        const parsed = parseLocation(checkIn.location);
        if (parsed) {
          if (parsed.type === 'address') {
            addressesToGeocode.push({ checkIn, parsed });
          } else {
            results.push({ ...checkIn, parsedLocation: parsed });
          }
        }
      }

      // Second pass: geocode addresses (with rate limiting)
      for (const { checkIn, parsed } of addressesToGeocode) {
        const coords = await geocodeAddress(parsed.original);
        if (coords) {
          results.push({
            ...checkIn,
            parsedLocation: { ...parsed, lat: coords.lat, lon: coords.lon }
          });
        }
        // Rate limit: Nominatim requests 1 request per second
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      setMappedCheckIns(results);
      setLoading(false);
    };

    processLocations();
  }, [open, checkIns]);

  // Invalidate map size after resize
  const handleResizeStop = () => {
    setMapKey(prev => prev + 1);
  };

  const getMarkerColor = (checkIn: MappedCheckIn): string => {
    // NCS gets special blue color regardless of status
    if (checkIn.user_id && ncsUserIds.includes(checkIn.user_id)) {
      return '#1565c0'; // dark blue for NCS
    }
    
    switch (checkIn.status) {
      case 'checked_in': return '#4caf50'; // green - standard check-in
      case 'listening': return '#9c27b0'; // purple - monitoring
      case 'away': return '#ff9800'; // orange - temporarily away
      case 'available': return '#f44336'; // red - has traffic
      case 'announcements': return '#00bcd4'; // cyan - has announcements
      case 'tactical': return '#795548'; // brown - tactical station
      case 'mobile': return '#607d8b'; // blue-gray - mobile station
      case 'priority': return '#e91e63'; // pink - priority traffic
      default: return '#4caf50';
    }
  };

  // Color legend for the map
  const colorLegend = [
    { color: '#1565c0', label: 'NCS', show: ncsUserIds.length > 0 },
    { color: '#4caf50', label: 'Checked In', show: true },
    { color: '#f44336', label: 'Has Traffic', show: true },
    { color: '#9c27b0', label: 'Listening', show: true },
    { color: '#ff9800', label: 'Away', show: true },
    { color: '#00bcd4', label: 'Announcements', show: true },
  ];

  const positions: [number, number][] = mappedCheckIns
    .filter(c => c.parsedLocation.lat !== 0 && c.parsedLocation.lon !== 0)
    .map(c => [c.parsedLocation.lat, c.parsedLocation.lon]);

  // Default center (USA)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const center = positions.length > 0 
    ? positions.reduce((acc, pos) => [acc[0] + pos[0] / positions.length, acc[1] + pos[1] / positions.length], [0, 0]) as [number, number]
    : defaultCenter;

  if (!open) return null;

  return (
    <Rnd
      default={{
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: minimized ? 48 : windowState.height,
      }}
      size={{ 
        width: windowState.width, 
        height: minimized ? 48 : windowState.height 
      }}
      position={{ x: windowState.x, y: windowState.y }}
      onDragStop={(_e, d) => {
        setWindowState(prev => ({ ...prev, x: d.x, y: d.y }));
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        setWindowState({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          x: position.x,
          y: position.y,
        });
        handleResizeStop();
      }}
      minWidth={isMobile ? 280 : 400}
      minHeight={minimized ? 48 : 300}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={!minimized}
      style={{ zIndex: 1300 }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 1,
        }}
      >
        {/* Title Bar - Draggable */}
        <Box
          className="drag-handle"
          sx={{
            py: 0.5,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              📍 Check-in Map
            </Typography>
            <Chip 
              label={`${mappedCheckIns.length} mapped`} 
              size="small" 
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.2)', 
                color: 'inherit',
                height: 20,
              }} 
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }} onTouchStart={(e) => e.stopPropagation()}>
            <IconButton
              size="small"
              onClick={() => setMinimized(!minimized)}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setMinimized(!minimized); }}
              sx={{ color: 'inherit', p: 0.5 }}
              title={minimized ? 'Restore' : 'Minimize'}
            >
              {minimized ? <CropSquareIcon fontSize="small" /> : <MinimizeIcon fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={onClose}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              sx={{ color: 'inherit', p: 0.5 }}
              title="Close"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Map Content - Only show when not minimized */}
        {!minimized && (
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
            {loading ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                gap: 2
              }}>
                <CircularProgress />
                <Typography color="text.secondary">
                  Parsing locations and geocoding addresses...
                </Typography>
              </Box>
            ) : mappedCheckIns.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                gap: 2,
                p: 2,
              }}>
                <Typography variant="h6" color="text.secondary">
                  No mappable locations found
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 400, textAlign: 'center' }}>
                  Check-ins need a location in one of these formats: GPS coordinates, 
                  Maidenhead grid square, UTM, MGRS, or City/State address.
                </Typography>
              </Box>
            ) : (
              <>
              <MapContainer
                key={mapKey}
                center={center}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
                ref={mapRef}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds positions={positions} />
                {mappedCheckIns.map((checkIn) => (
                  checkIn.parsedLocation.lat !== 0 && checkIn.parsedLocation.lon !== 0 && (
                    <Marker
                      key={checkIn.id}
                      position={[checkIn.parsedLocation.lat, checkIn.parsedLocation.lon]}
                      icon={createColoredIcon(getMarkerColor(checkIn))}
                    >
                      <Popup>
                        <Box sx={{ minWidth: 150 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                              {checkIn.callsign}
                            </Typography>
                            {checkIn.user_id && ncsUserIds.includes(checkIn.user_id) && (
                              <Typography component="span" sx={{ fontSize: '0.9rem' }}>👑</Typography>
                            )}
                          </Box>
                          {checkIn.name && (
                            <Typography variant="body2">{checkIn.name}</Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            {checkIn.location}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary">
                            ({checkIn.parsedLocation.type})
                          </Typography>
                        </Box>
                      </Popup>
                    </Marker>
                  )
                ))}
              </MapContainer>
              {/* Color Legend */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 24,
                  right: 8,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  boxShadow: 1,
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.25,
                }}
              >
                {colorLegend
                  .filter(item => item.show)
                  .map((item) => (
                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: item.color,
                          border: '1px solid white',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}
                      />
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
                        {item.label}
                      </Typography>
                    </Box>
                  ))}
              </Box>
              </>
            )}
          </Box>
        )}
      </Paper>
    </Rnd>
  );
};

export default CheckInMap;
