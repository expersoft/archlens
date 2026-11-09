import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), planElement: vi.fn(), planOpen: vi.fn() }));
const shown = {
  views: [], skipped: [], summary: '~1', report: null, opsHash: 'h', questions: [], screenConflicts: [],
  changes: [{ sign: '~', kind: 'element', id: 'a', name: 'Cashback', origin: 'chat', fields: [] }],
};
// Like the real diagram frame: asked to focus a node it does not draw, it answers with select(null).
vi.mock('./PlanPreview', () => ({
  PlanPreview: ({ onLoaded, onSelect, focus }: { onLoaded?: (r: unknown) => void; onSelect?: (id: string | null) => void; focus?: { id: string; n: number } | null }) => {
    const seen = useRef<number | undefined>(undefined);
    useEffect(() => { if (focus && focus.n !== seen.current) { seen.current = focus.n; onSelect?.(null); } }, [focus, onSelect]);
    return <button type="button" onClick={() => onLoaded?.(shown)}>carregar prévia</button>;
  },
}));

import { useEffect, useRef } from 'react';
import * as api from '../api';
import { save } from './draftStore';
import { PlanView } from './PlanView';

const draft = { 'archlens-draft': 1, base: { id: 'b', version: 'v' }, delta: { x: 1 }, plan: null, note: 'n' };
const card: api.Card = {
  element: { id: 'a', name: 'Cashback', type: 'application-component', layer: 'application' },
  parent: null as never, children: [], outgoing: {}, incoming: {}, properties: { dono: 'time' },
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('archlens-plan-delta', 'true');
  save('b', draft, []);
  vi.mocked(api.planOpen).mockResolvedValue({ draft, previews: [] } as never);
  vi.mocked(api.planElement).mockResolvedValue({ card, doc: null, docRaw: null, docs: true, removed: false });
});
afterEach(() => vi.restoreAllMocks());

describe('PlanView: escolher no Delta um nó que a prévia não desenha', () => {
  it('a aba Nó mostra o cartão do nó mesmo assim', async () => {
    render(<PlanView base="b" />);
    fireEvent.click(screen.getByText('carregar prévia'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cashback' }));
    expect(await screen.findByRole('heading', { name: 'Cashback' })).toBeTruthy();
    expect(screen.queryByText(/Selecione um nó/)).toBeNull();
  });
});
