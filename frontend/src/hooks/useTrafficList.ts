import { useCallback, useEffect, useRef, useState } from 'react';
import { trafficApi } from '../services/api';
import { getErrorMessage } from '../utils/apiErrors';

// ========== useTrafficList ==========
// List + filters + pagination for the Traffic Browse tab, backed by
// GET /traffic/forms (visibility-scoped server-side, see
// docs/concepts/TRAFFIC-HANDLING-DESIGN.md D3). Follows the same
// loading/error/refetch shape as useApiData, but owns filter and page state
// itself since changing either must trigger a new server request rather
// than a client-side re-filter of already-fetched rows.

export interface TrafficForm {
  id: number;
  definition_id: number;
  form_type: string;
  definition_version: string;
  net_id: number | null;
  created_by_id: number | null;
  field_values: Record<string, any>;
  subject: string | null;
  addressee_display: string | null;
  message_number: string | null;
  precedence: string | null;
  handling: string | null;
  station_of_origin: string | null;
  check_count: number | null;
  check_stated: number | null;
  normalized_text: string | null;
  held_by_user_id: number | null;
  held_since: string | null;
  last_action: string | null;
  disposition: 'draft' | 'pending' | 'relayed' | 'delivered' | 'cancelled';
  test_category: 'drill' | 'demo' | null;
  filed_at: string;
  created_at: string;
  updated_at: string | null;
}

export interface TrafficListFilters {
  q: string;
  form_type: string;
  net_id?: number;
  disposition: string;
  precedence: string;
  handling: string;
  mine: boolean;
  held_by_me: boolean;
}

export const DEFAULT_TRAFFIC_FILTERS: TrafficListFilters = {
  q: '',
  form_type: '',
  disposition: '',
  precedence: '',
  handling: '',
  mine: false,
  held_by_me: false,
};

export const TRAFFIC_PAGE_SIZE = 50;

export function useTrafficList(initialFilters?: Partial<TrafficListFilters>) {
  const [filters, setFilters] = useState<TrafficListFilters>({ ...DEFAULT_TRAFFIC_FILTERS, ...initialFilters });
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<TrafficForm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pageRef = useRef(page);
  pageRef.current = page;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const f = filtersRef.current;
    try {
      const res = await trafficApi.list({
        q: f.q || undefined,
        form_type: f.form_type || undefined,
        net_id: f.net_id,
        disposition: f.disposition || undefined,
        precedence: f.precedence || undefined,
        handling: f.handling || undefined,
        mine: f.mine || undefined,
        held_by_me: f.held_by_me || undefined,
        limit: TRAFFIC_PAGE_SIZE,
        offset: pageRef.current * TRAFFIC_PAGE_SIZE,
      });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load traffic'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Any filter change restarts the browse at page 0.
  useEffect(() => {
    setPage(0);
  }, [filters.q, filters.form_type, filters.net_id, filters.disposition, filters.precedence, filters.handling, filters.mine, filters.held_by_me]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.q, filters.form_type, filters.net_id, filters.disposition, filters.precedence, filters.handling, filters.mine, filters.held_by_me]);

  return {
    items,
    total,
    loading,
    error,
    refetch,
    filters,
    setFilters,
    page,
    setPage,
    pageSize: TRAFFIC_PAGE_SIZE,
  };
}

export default useTrafficList;
