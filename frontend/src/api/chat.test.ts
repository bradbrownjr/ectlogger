import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { chatApi } from './chat';
import api from '../services/api';

const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('chatApi.list — in-flight coalescing', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('serves concurrent callers from a single request', async () => {
    // Chat.tsx and ActivityLog.tsx both fetch on mount and on netResync.
    let resolve: (v: any) => void = () => {};
    (api.get as any).mockReturnValue(new Promise(r => { resolve = r; }));

    const a = chatApi.list(7);
    const b = chatApi.list(7);
    resolve({ data: msgs(3) });
    const [ra, rb] = await Promise.all([a, b]);

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(ra.data).toHaveLength(3);
    expect(rb.data).toHaveLength(3);
  });

  it('gives each caller an independent array', async () => {
    (api.get as any).mockResolvedValue({ data: msgs(2) });

    const [ra, rb] = await Promise.all([chatApi.list(7), chatApi.list(7)]);

    expect(ra.data).not.toBe(rb.data); // no shared reference
    ra.data.push({ id: 99 } as any);
    expect(rb.data).toHaveLength(2);   // one panel cannot disturb the other
  });

  it('does not coalesce across different nets', async () => {
    (api.get as any).mockResolvedValue({ data: msgs(1) });

    await Promise.all([chatApi.list(7), chatApi.list(8)]);

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('issues a fresh request once the previous one settled', async () => {
    // A resync after a later reconnect must actually hit the network again,
    // never replay a stale cached thread.
    (api.get as any).mockResolvedValue({ data: msgs(1) });

    await chatApi.list(7);
    await chatApi.list(7);

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('propagates a failure to every waiting caller without poisoning later ones', async () => {
    (api.get as any).mockRejectedValueOnce(new Error('offline'));

    const a = chatApi.list(7);
    const b = chatApi.list(7);
    await expect(a).rejects.toThrow('offline');
    await expect(b).rejects.toThrow('offline');

    // The failed entry must be cleared, or the panel could never recover.
    (api.get as any).mockResolvedValue({ data: msgs(1) });
    const after = await chatApi.list(7);
    expect(after.data).toHaveLength(1);
  });
});
