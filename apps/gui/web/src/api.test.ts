import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, planApplyStream, type ApplyEvent } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('planApplyStream', () => {
  it('envia stream: true e repassa os eventos NDJSON', async () => {
    const lines = [{ type: 'step', step: 'check', state: 'done' }, { type: 'check', done: 1, total: 2, key: 'ctx' }].map((e) => JSON.stringify(e)).join('\n') + '\n';
    const fetch = vi.fn(async () => new Response(lines, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const got: ApplyEvent[] = [];
    await planApplyStream('b', { x: 1 }, 'h1', (e) => got.push(e), new AbortController().signal);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ draft: { x: 1 }, confirm: 'h1', stream: true });
    expect(got.map((e) => e.type)).toEqual(['step', 'check']);
  });

  it('a recusa antes do fluxo vira ApiError com o resto do corpo em extra', async () => {
    const body = { error: 'o plano mudou', code: 'E_GUI_PLAN_CHANGED', draft: { y: 2 }, opsHash: 'h2' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 409 })));
    const err = await planApplyStream('b', {}, 'h1', () => {}, new AbortController().signal).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'o plano mudou', code: 'E_GUI_PLAN_CHANGED', status: 409, extra: { draft: { y: 2 }, opsHash: 'h2' } });
  });
});
