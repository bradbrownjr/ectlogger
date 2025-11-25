import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
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

const CheckInMap: React.FC<CheckInMapProps> = ({ open, onClose, checkIns, netName }) => {
  const [mappedCheckIns, setMappedCheckIns] = useState<MappedCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocodeQueue, setGeocodeQueue] = useState<string[]>([]);

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

  const getMarkerColor = (status: string): string => {
    switch (status) {
      case 'checked_in': return '#4caf50'; // green
      case 'listening': return '#9c27b0'; // purple
      case 'away': return '#ff9800'; // orange
      case 'available': return '#f44336'; // red (traffic)
      case 'announcements': return '#2196f3'; // blue
      default: return '#4caf50';
    }
  };

  const positions: [number, number][] = mappedCheckIns
    .filter(c => c.parsedLocation.lat !== 0 && c.parsedLocation.lon !== 0)
    .map(c => [c.parsedLocation.lat, c.parsedLocation.lon]);

  // Default center (USA)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const center = positions.length > 0 
    ? positions.reduce((acc, pos) => [acc[0] + pos[0] / positions.length, acc[1] + pos[1] / positions.length], [0, 0]) as [number, number]
    : defaultCenter;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '80vh' }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">Check-in Map</Typography>
          <Typography variant="body2" color="text.secondary">{netName}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip 
            label={`${mappedCheckIns.length} mapped`} 
            size="small" 
            color="primary" 
          />
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{ color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, position: 'relative' }}>
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
            gap: 2
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
          <MapContainer
            center={center}
            zoom={6}
            style={{ height: '100%', width: '100%' }}
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
                  icon={createColoredIcon(getMarkerColor(checkIn.status))}
                >
                  <Popup>
                    <Box sx={{ minWidth: 150 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                        {checkIn.callsign}
                      </Typography>
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
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckInMap;
