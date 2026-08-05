import { useCallback, useEffect, useState } from 'react';
import { trafficApi } from '../services/api';

// ========== useFormDefinitions ==========
// Fetch-once, module-level-cached list of enabled form definitions. Feeds
// both the "New" tab's form-type picker and FormRenderer's field schema.
// Cached at module scope (not per-hook-instance) so mounting the picker and
// the renderer in the same page doesn't issue two requests.

export interface FormDefinitionField {
  id: number;
  definition_id: number;
  name: string;
  label: string;
  field_type: 'text' | 'textarea' | 'choice' | 'yesno';
  description?: string | null;
  help_text?: string | null;
  is_required: boolean;
  max_length?: number | null;
  choices?: string[] | null;
  validator?: string | null;
  default_now?: string | null;
  auto_fill?: string | null;
  nts_normalize: boolean;
  arl_enabled: boolean;
  // Where an RRI strip's "/ /" section breaks fall, for dynamically-defined
  // strip types (traffic_strip_templates.py). Always false on builtins.
  starts_new_section: boolean;
  sort_order: number;
}

export interface FormDefinition {
  id: number;
  form_type: string;
  title: string;
  description?: string | null;
  version: string;
  output_format: string;
  // RRI strip types only: the leading keyword of the canonical
  // slash-delimited string, which is not always the form_type
  // (GYX-CAR-SKYWARN transmits as "GYX-CAR WEATHER"). Supplied by the
  // backend so the composer's live strip preview matches exactly what
  // format_rri_strip() will store. Null for every other output_format.
  strip_keyword?: string | null;
  is_builtin: boolean;
  is_enabled: boolean;
  sort_order: number;
  fields: FormDefinitionField[];
  created_at: string;
  updated_at?: string | null;
}

let cachedDefinitions: FormDefinition[] | null = null;
let inFlight: Promise<FormDefinition[]> | null = null;

function fetchDefinitions(): Promise<FormDefinition[]> {
  if (cachedDefinitions) return Promise.resolve(cachedDefinitions);
  if (!inFlight) {
    inFlight = trafficApi.listDefinitions()
      .then((res) => {
        cachedDefinitions = res.data;
        return cachedDefinitions as FormDefinition[];
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Clears the module-level cache so a newly-defined RRI strip type
// (traffic_strip_templates.py) shows up in the New tab's picker on the next
// fetchDefinitions() call, without a page reload. Callers still need to
// trigger a refetch themselves (e.g. re-mount, or a state bump) -- this only
// invalidates the cache, it doesn't push new data to already-rendered hooks.
export function invalidateFormDefinitionsCache(): void {
  cachedDefinitions = null;
}

export function useFormDefinitions() {
  const [definitions, setDefinitions] = useState<FormDefinition[]>(cachedDefinitions ?? []);
  const [loading, setLoading] = useState(!cachedDefinitions);
  const [error, setError] = useState<string | null>(null);
  // Bumped by reload() below to re-run the effect. A counter rather than a
  // standalone fetch so the cancelled-flag cleanup still applies.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (cachedDefinitions) {
      setDefinitions(cachedDefinitions);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDefinitions()
      .then((data) => {
        if (!cancelled) setDefinitions(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail ?? 'Failed to load form definitions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Drop the shared cache and refetch, so a strip type just defined from net
  // settings or the Import tab appears in this hook's list without a reload.
  const reload = useCallback(() => {
    invalidateFormDefinitionsCache();
    setReloadToken((t) => t + 1);
  }, []);

  return { definitions, loading, error, reload };
}

export default useFormDefinitions;
