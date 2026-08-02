import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import { useCoverageStations } from '../../hooks/useCoverageStations';
import CoverageMap from './CoverageMap';

// ========== COVERAGE TAB ==========
// The Profile page's Coverage tab: Phase 5 of the "Can hear" inter-station
// propagation logging feature (see docs/ROADMAP.md "Relaying & Propagation
// Mapping"). Shows a personal map of the stations the current user has
// confirmed hearing from home, aggregated across all of their own reports
// over time. Fully self-contained per ActivityTab.tsx's shape - owns its own
// data fetch via useCoverageStations(), no shared-form props.

const CoverageTab: React.FC = () => {
  const { stations, loading } = useCoverageStations();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (stations.length === 0) {
    return (
      <Typography color="text.secondary">
        No coverage reports recorded yet. When NCS, Logger, or Relay records which stations you can hear while you're checked in from a "Home" operating position, they'll show up here.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <MapIcon color="primary" />
        <Typography variant="h6">Your Home Station Coverage</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Stations you've personally confirmed hearing from home, across every net you've participated in.
      </Typography>
      <CoverageMap stations={stations} />
    </Box>
  );
};

export default CoverageTab;
