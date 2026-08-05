import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Tabs,
  Tab,
  Badge,
  Typography,
  Button,
  Alert,
  Pagination,
  CircularProgress,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import InboxIcon from '@mui/icons-material/Inbox';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import { netApi } from '../services/api';
import { useFormDefinitions, FormDefinition } from '../hooks/useFormDefinitions';
import { useTrafficList } from '../hooks/useTrafficList';
import useTrafficInbox from '../hooks/useTrafficInbox';
import TrafficFilters from '../components/traffic/TrafficFilters';
import TrafficTable from '../components/traffic/TrafficTable';
import TrafficDetail from '../components/traffic/TrafficDetail';
import TrafficInbox from '../components/traffic/TrafficInbox';
import TrafficComposer from '../components/traffic/TrafficComposer';
import ImportPreview from '../components/traffic/ImportPreview';

// ========== Traffic page ==========
// The canonical Traffic section: Browse, Inbox, New, and Import this phase
// (Definitions is a later phase -- the tab list is structured so adding it is
// inserting an index, not restructuring). See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 4.2.

const MAX_TAB_INDEX = 3; // Browse (0), Inbox (1), New (2), Import (3) -- raise when Definitions lands

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} id={`traffic-tabpanel-${index}`} aria-labelledby={`traffic-tab-${index}`}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

// ========== BROWSE TAB ==========
const BrowseTab: React.FC<{ definitions: FormDefinition[]; onViewForm: (id: number) => void; initialHeldByMe?: boolean }> = ({ definitions, onViewForm, initialHeldByMe }) => {
  const { items, total, loading, error, filters, setFilters, page, setPage, pageSize } = useTrafficList(
    initialHeldByMe ? { held_by_me: true } : undefined
  );
  const { user } = useAuth();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Box>
      <TrafficFilters filters={filters} setFilters={setFilters} definitions={definitions} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <>
          <TrafficTable items={items} currentUserId={user?.id} onRowClick={onViewForm} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {total} {total === 1 ? 'item' : 'items'}
            </Typography>
            {pageCount > 1 && (
              <Pagination
                size="small"
                color="primary"
                count={pageCount}
                page={page + 1}
                onChange={(_, p) => setPage(p - 1)}
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

const Traffic: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabValue, setTabValue] = useState(() => {
    const tab = parseInt(searchParams.get('tab') || '0', 10);
    return isNaN(tab) ? 0 : Math.min(tab, MAX_TAB_INDEX);
  });
  const { definitions, loading: definitionsLoading, error: definitionsError } = useFormDefinitions();
  const { count: inboxCount } = useTrafficInbox();

  const viewingId = searchParams.get('id');
  // held_by_me pre-filters the Browse tab to only what the caller holds
  // (TRAFFIC-HANDLING-DESIGN.md section 4.5).
  const heldByMe = searchParams.get('held_by_me') === '1';
  // net_id arrives from a net's Traffic panel ("View all in Traffic"). It
  // both scopes what's shown and, crucially, is passed to the composer so
  // anything filed from here belongs to that net instead of being orphaned.
  const netIdParam = searchParams.get('net_id');
  const netId = netIdParam ? parseInt(netIdParam, 10) : undefined;
  const [netContext, setNetContext] = useState<any | null>(null);

  useEffect(() => {
    if (!netId) {
      setNetContext(null);
      return;
    }
    let cancelled = false;
    netApi.get(netId)
      .then((res) => {
        if (!cancelled) setNetContext(res.data);
      })
      .catch(() => {
        // A net the caller can't see just means no net-specific scoping --
        // the composer falls back to filing unaffiliated traffic.
        if (!cancelled) setNetContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [netId]);

  // Every tab/nav change rebuilds the query string, so net_id has to be
  // carried forward explicitly or filing silently detaches from the net.
  const withNetId = (params: Record<string, string>) =>
    netIdParam ? { ...params, net_id: netIdParam } : params;

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchOnScrollable = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchOnScrollable.current = false;
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      if (el.scrollWidth > el.clientWidth) {
        touchOnScrollable.current = true;
        break;
      }
      el = el.parentElement;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (touchOnScrollable.current) return;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaY) > Math.abs(deltaX)) return;
    const next = deltaX < 0 ? Math.min(tabValue + 1, MAX_TAB_INDEX) : Math.max(tabValue - 1, 0);
    setTabValue(next);
    setSearchParams(withNetId(next > 0 ? { tab: String(next) } : {}));
  };

  const handleViewForm = (id: number) => {
    setSearchParams(withNetId({ id: String(id) }));
  };

  const handleBackToBrowse = () => {
    setSearchParams(withNetId({}));
  };

  const handleCreated = (id: number) => {
    setSearchParams(withNetId({ id: String(id) }));
    setTabValue(0);
  };

  if (viewingId) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBackToBrowse} sx={{ mb: 2, minHeight: 44 }}>
          Back to Traffic
        </Button>
        <TrafficDetail formId={parseInt(viewingId, 10)} />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 } }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => {
              setTabValue(newValue);
              setSearchParams(withNetId(newValue > 0 ? { tab: String(newValue) } : {}));
            }}
            aria-label="traffic tabs"
            variant="scrollable"
            scrollButtons={false}
            sx={{ '& .MuiTab-root': { minWidth: { xs: 80, sm: 120 }, px: { xs: 1.5, sm: 2 } } }}
          >
            <Tab icon={<ListAltIcon />} iconPosition="start" label="Browse" id="traffic-tab-0" aria-controls="traffic-tabpanel-0" />
            <Tab
              icon={
                <Badge color="error" badgeContent={inboxCount} max={99}>
                  <InboxIcon />
                </Badge>
              }
              iconPosition="start"
              label="Inbox"
              id="traffic-tab-1"
              aria-controls="traffic-tabpanel-1"
            />
            <Tab icon={<AddIcon />} iconPosition="start" label="New" id="traffic-tab-2" aria-controls="traffic-tabpanel-2" />
            <Tab icon={<UploadFileIcon />} iconPosition="start" label="Import" id="traffic-tab-3" aria-controls="traffic-tabpanel-3" />
          </Tabs>
        </Box>

        {definitionsError && <Alert severity="error" sx={{ mt: 2 }}>{definitionsError}</Alert>}

        {definitionsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {/* ========== Browse Tab ========== */}
            <TabPanel value={tabValue} index={0}>
              <BrowseTab definitions={definitions} onViewForm={handleViewForm} initialHeldByMe={heldByMe} />
            </TabPanel>

            {/* ========== Inbox Tab ========== */}
            <TabPanel value={tabValue} index={1}>
              <TrafficInbox />
            </TabPanel>

            {/* ========== New Tab ========== */}
            <TabPanel value={tabValue} index={2}>
              <TrafficComposer
                definitions={definitions}
                onCreated={handleCreated}
                netId={netId}
                allowedFormTypes={netContext?.traffic_form_types}
                stripFormType={netContext?.traffic_strip_form_type}
                stripTemplateRaw={netContext?.traffic_strip_template}
                contextLabel={netContext ? `Filing for ${netContext.name}` : undefined}
              />
            </TabPanel>

            {/* ========== Import Tab ========== */}
            <TabPanel value={tabValue} index={3}>
              <ImportPreview
                definitions={definitions}
                onCreated={handleCreated}
                netId={netId}
                onGoToNewTab={() => {
                  setTabValue(2);
                  setSearchParams(withNetId({ tab: '2' }));
                }}
              />
            </TabPanel>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default Traffic;
