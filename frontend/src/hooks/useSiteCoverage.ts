import { useCallback, useEffect, useState } from 'react';
import { coverageSiteApi } from '../services/api';
import { CoverageAccess, CoverageContact, CoverageSite, EMPTY_SITE_COVERAGE, SiteCoverageSummary } from '../utils/coverageSites';

// ========== useSiteCoverage ==========
// A net's coverage sites, its contacts outside the net, its repeater and
// node results, and the by-site rollup, fetched together. Like the "can hear" reports, never patched
// locally: refresh() refetches all of them, and NetView/NetPaneWindow call it
// on every can_hear_changed WebSocket message (sites and contacts broadcast
// that same event). Off (and empty) on nets without coverage logging.
export function useSiteCoverage(netId: number | null, enabled: boolean) {
  const [sites, setSites] = useState<CoverageSite[]>([]);
  const [contacts, setContacts] = useState<CoverageContact[]>([]);
  const [access, setAccess] = useState<CoverageAccess[]>([]);
  const [summary, setSummary] = useState<SiteCoverageSummary>(EMPTY_SITE_COVERAGE);

  const refresh = useCallback(async () => {
    if (!netId || !enabled) return;
    try {
      const [sitesRes, contactsRes, accessRes, summaryRes] = await Promise.all([
        coverageSiteApi.listSites(netId),
        coverageSiteApi.listContacts(netId),
        coverageSiteApi.listAccess(netId),
        coverageSiteApi.summary(netId),
      ]);
      setSites(sitesRes.data);
      setContacts(contactsRes.data);
      setAccess(accessRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Failed to fetch coverage sites:', error);
    }
  }, [netId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sites, contacts, access, summary, refresh };
}
