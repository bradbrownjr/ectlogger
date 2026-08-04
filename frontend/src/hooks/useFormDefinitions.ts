import { useEffect, useState } from 'react';
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
  sort_order: number;
}

export interface FormDefinition {
  id: number;
  form_type: string;
  title: string;
  description?: string | null;
  version: string;
  output_format: string;
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
  }, []);

  return { definitions, loading, error };
}

export default useFormDefinitions;
