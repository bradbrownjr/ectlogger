// Where the Browserless container is, for capture.mjs and inspect.mjs.
//
// BROWSERLESS_URL wins when set (a full ws:// URL with its ?token=). Otherwise
// it is built from ~/.browserless/config.json ({"ws_url", "token"}), the same
// file the cross-project browserless skill reads. The token is never written
// into this repository: until 2026-10-27 both scripts carried one as a
// fallback, it went stale, and a run hung for 30 s on the connect with no hint
// why.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function browserlessUrl() {
  if (process.env.BROWSERLESS_URL) return process.env.BROWSERLESS_URL;
  const path = join(homedir(), '.browserless', 'config.json');
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Set BROWSERLESS_URL, or create ${path} with ws_url and token (${err.message})`);
  }
  if (!config.ws_url || !config.token) {
    throw new Error(`${path} needs both ws_url and token`);
  }
  const sep = config.ws_url.includes('?') ? '&' : '?';
  return `${config.ws_url}${sep}token=${encodeURIComponent(config.token)}`;
}
