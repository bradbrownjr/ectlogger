import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { userApi } from '../services/api';

interface LocationContextType {
  gridSquare: string | null;
  // "Town, ST" the server resolved the position to; null until it answers,
  // or if the lookup failed (callers fall back to the grid square)
  town: string | null;
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  refreshLocation: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

/**
 * Convert latitude/longitude to Maidenhead grid square (6 characters)
 */
function toMaidenhead(lat: number, lon: number): string {
  // Normalize longitude to 0-360 and latitude to 0-180
  lon = lon + 180;
  lat = lat + 90;

  // Field (2 letters, A-R)
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  
  // Square (2 digits, 0-9)
  const squareLon = Math.floor((lon % 20) / 2);
  const squareLat = Math.floor(lat % 10);
  
  // Subsquare (2 letters, a-x)
  const subLon = Math.floor((lon % 2) * 12);
  const subLat = Math.floor((lat % 1) * 24);

  const field = String.fromCharCode(65 + fieldLon) + String.fromCharCode(65 + fieldLat);
  const square = squareLon.toString() + squareLat.toString();
  const subsquare = String.fromCharCode(97 + subLon) + String.fromCharCode(97 + subLat);

  return field + square + subsquare;
}

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [gridSquare, setGridSquare] = useState<string | null>(null);
  const [town, setTown] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedGrid = useRef<string | null>(null);

  // Save grid square to database when it changes. The coordinates go along
  // rounded to 2 decimal places (~1 km), enough for the server to name the
  // town and no more precise than that needs.
  const saveLocationToServer = useCallback(async (grid: string, lat: number, lon: number) => {
    if (grid && grid !== lastSavedGrid.current) {
      try {
        const round = (n: number) => Math.round(n * 100) / 100;
        const response = await userApi.updateLocation(grid, round(lat), round(lon));
        lastSavedGrid.current = grid;
        setTown(response.data?.live_location_town ?? null);
        console.debug('[LOCATION] Saved grid square to server:', grid);
      } catch (err) {
        console.error('[LOCATION] Failed to save grid square:', err);
      }
    }
  }, []);

  const fetchLocation = useCallback(() => {
    if (!user?.location_awareness) {
      setGridSquare(null);
      setTown(null);
      setLatitude(null);
      setLongitude(null);
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lon } = position.coords;
        const newGridSquare = toMaidenhead(lat, lon);
        setLatitude(lat);
        setLongitude(lon);
        setGridSquare(newGridSquare);
        setLoading(false);
        
        // Save to database for NCS lookup
        saveLocationToServer(newGridSquare, lat, lon);
      },
      (err) => {
        console.error('[LOCATION] Geolocation error:', err.message);
        setError(err.message);
        setLoading(false);
      },
      {
        enableHighAccuracy: false,  // Don't need GPS precision
        timeout: 10000,
        maximumAge: 300000  // Cache for 5 minutes
      }
    );
  }, [user?.location_awareness, saveLocationToServer]);

  // Fetch location when user enables location awareness or user object changes
  useEffect(() => {
    if (user?.location_awareness) {
      fetchLocation();
    }
  }, [fetchLocation, user?.location_awareness]);

  // Refresh location periodically (every 5 minutes) if enabled
  useEffect(() => {
    if (!user?.location_awareness) return;

    const interval = setInterval(fetchLocation, 300000);  // 5 minutes
    return () => clearInterval(interval);
  }, [user?.location_awareness, fetchLocation]);

  return (
    <LocationContext.Provider
      value={{
        gridSquare,
        town,
        latitude,
        longitude,
        loading,
        error,
        refreshLocation: fetchLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
