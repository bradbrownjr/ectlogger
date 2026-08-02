import React, { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Tabs,
  Tab,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Button,
  Alert,
  Pagination,
  CircularProgress,
} from '@mui/material';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../contexts/AuthContext';
import { trafficApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';
import { useFormDefinitions, FormDefinition } from '../hooks/useFormDefinitions';
import { useTrafficList } from '../hooks/useTrafficList';
import TrafficFilters from '../components/traffic/TrafficFilters';
import TrafficTable from '../components/traffic/TrafficTable';
import TrafficDetail from '../components/traffic/TrafficDetail';
import FormRenderer from '../components/traffic/FormRenderer';

// ========== Traffic page ==========
// The canonical Traffic section: Browse and New this phase (Inbox, Import,
// and Definitions tabs are later phases -- the tab list is structured so
// adding them is inserting an index, not restructuring). See
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md section 4.2.

const MAX_TAB_INDEX = 1; // Browse (0), New (1) -- raise when Inbox/Import/Definitions land

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
const BrowseTab: React.FC<{ definitions: FormDefinition[]; onViewForm: (id: number) => void }> = ({ definitions, onViewForm }) => {
  const { items, total, loading, error, filters, setFilters, page, setPage, pageSize } = useTrafficList();
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

// ========== NEW TAB ==========
const NewTab: React.FC<{ definitions: FormDefinition[]; onCreated: (id: number) => void }> = ({ definitions, onCreated }) => {
  const [selected, setSelected] = useState<FormDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await trafficApi.create({ form_type: selected.form_type, field_values: values });
      onCreated(resp.data.id);
      setSelected(null);
      setValues({});
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to create this traffic item'));
    } finally {
      setSaving(false);
    }
  };

  if (!selected) {
    return (
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>Choose a form type</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {definitions.map((d) => (
            <Card key={d.form_type} sx={{ width: { xs: '100%', sm: 260 } }}>
              <CardActionArea onClick={() => setSelected(d)} sx={{ minHeight: 44 }}>
                <CardContent>
                  <Typography variant="subtitle1">{d.title}</Typography>
                  {d.description && (
                    <Typography variant="body2" color="text.secondary">{d.description}</Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => setSelected(null)}
        sx={{ mb: 2, minHeight: 44 }}
      >
        Choose a different type
      </Button>
      <Typography variant="h6" sx={{ mb: 2 }}>{selected.title}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <FormRenderer definition={selected} values={values} onChange={handleChange} disabled={saving} />
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleSubmit}
          disabled={saving}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Saving...' : 'Create'}
        </Button>
      </Box>
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

  const viewingId = searchParams.get('id');

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
    setSearchParams(next > 0 ? { tab: String(next) } : {});
  };

  const handleViewForm = (id: number) => {
    setSearchParams({ id: String(id) });
  };

  const handleBackToBrowse = () => {
    setSearchParams({});
  };

  const handleCreated = (id: number) => {
    setSearchParams({ id: String(id) });
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
              setSearchParams(newValue > 0 ? { tab: String(newValue) } : {});
            }}
            aria-label="traffic tabs"
            variant="scrollable"
            scrollButtons={false}
            sx={{ '& .MuiTab-root': { minWidth: { xs: 80, sm: 120 }, px: { xs: 1.5, sm: 2 } } }}
          >
            <Tab icon={<ListAltIcon />} iconPosition="start" label="Browse" id="traffic-tab-0" aria-controls="traffic-tabpanel-0" />
            <Tab icon={<AddIcon />} iconPosition="start" label="New" id="traffic-tab-1" aria-controls="traffic-tabpanel-1" />
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
              <BrowseTab definitions={definitions} onViewForm={handleViewForm} />
            </TabPanel>

            {/* ========== New Tab ========== */}
            <TabPanel value={tabValue} index={1}>
              <NewTab definitions={definitions} onCreated={handleCreated} />
            </TabPanel>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default Traffic;
