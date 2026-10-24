import { useCallback, useEffect, useState } from 'react';
import { coverageSiteApi } from '../services/api';
import { CoverageAccess, CoverageContact, CoverageSite, EMPTY_SITE_COVERAGE, SiteCoverageSummary } from '../utils/coverageSites';

// ========== useSiteCoverage ==========
// A net's sites, and on a coverage net also its contacts outside the net,
// its repeater and node results, and the by-site rollup, fetched together.
// Like the "can hear" reports, never patched locally: refresh() refetches
// all of them, and NetView/NetPaneWindow call it on every can_hear_changed
// WebSocket message (sites and contacts broadcast that same event). Sites
// load on every net, since any net may have them (the Site box, the board);
// the rest is coverage logging only.
export function useSiteCoverage(netId: number | null, coverageEnabled: boolean) {
  const [sites, setSites] = useState<CoverageSite[]>([]);
  const [contacts, setContacts] = useState<CoverageContact[]>([]);
  const [access, setAccess] = useState<CoverageAccess[]>([]);
  const [summary, setSummary] = useState<SiteCoverageSummary>(EMPTY_SITE_COVERAGE);

  // `background` marks a refresh no one asked for (the catch-up after a
  // reconnect) so it doesn't count as operator activity.
  const refresh = useCallback(async (background = false) => {
    if (!netId) return;
    try {
      if (!coverageEnabled) {
        setSites((await coverageSiteApi.listSites(netId, background)).data);
        return;
      }
      const [sitesRes, contactsRes, accessRes, summaryRes] = await Promise.all([
        coverageSiteApi.listSites(netId, background),
        coverageSiteApi.listContacts(netId, background),
        coverageSiteApi.listAccess(netId, background),
        coverageSiteApi.summary(netId, background),
      ]);
      setSites(sitesRes.data);
      setContacts(contactsRes.data);
      setAccess(accessRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Failed to fetch coverage sites:', error);
    }
  }, [netId, coverageEnabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sites, contacts, access, summary, refresh };
}
