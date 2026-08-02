import { useState, useEffect, useCallback, useRef } from 'react';
import { getErrorMessage } from '../utils/apiErrors';

interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches data from an async function on mount and returns loading/error/data.
 * Calling `refetch()` re-runs the fetch.
 *
 * Error messages are extracted from `err.response.data.detail` (FastAPI shape)
 * then `err.message`, then a generic fallback — matching the pattern used
 * throughout the app.
 *
 * The `fetchFn` reference is read via a ref so it need not be stable — inline
 * lambdas at the call site work without wrapping in useCallback.
 *
 * Usage:
 *   const { data: stats, loading, error } = useApiData<GlobalStats>(
 *     () => statisticsApi.getGlobal().then(r => r.data)
 *   );
 */
function useApiData<T>(fetchFn: () => Promise<T>): UseApiDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always call the latest fetchFn without making it a dependency of refetch
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current();
      setData(result);
    } catch (err: any) {
      const msg: string = getErrorMessage(err, err?.message ?? 'An error occurred');
      console.error('[useApiData]', msg, err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export default useApiData;
